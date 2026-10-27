// The standalone daily page (daily/index.html, docs/DAILY_SPEC.md, "v2: Easy and Hard, scored out of 100").
// Answers come from daily-easy.json and daily.json and are pressed into the real page. The gnome's walk is
// skipped (reduced motion) so tests stay fast; the animation itself is covered by play.spec.js.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseLevel, buildableLines, capViolation, cutsAllRoutes } from '../src/game/index.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const data = { easy: readJson('../assets/levels/daily-easy.json'), hard: readJson('../assets/levels/daily.json') };
const level = (mode, i = 0) => data[mode].levels[i]; // i = day index, 0 is 27 Oct 2026, #1
const KEY = 'gnome-sweet-gnome:daily:v2';
const V1_KEY = 'gnome-sweet-gnome:daily:v1';
const NOON = (date) => new Date(`${date}T12:00:00+11:00`);
const url = (mode, date) => `/daily/?mode=${mode}${date ? `&date=${date}` : ''}`;

test.use({ reducedMotion: 'reduce', timezoneId: 'Australia/Sydney' });

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const bars = (page) => page.locator('#board .wall-bar');
const hintBars = (page) => page.locator('#board .wall-bar[data-hint="1"]');
const tryBtn = (page) => page.locator('#go');
const result = (page) => page.locator('#result');
const hintBtn = (page) => page.locator('#hint-btn');
const left = (page) => page.locator('#pips i.left'); // filled pips: tries left
const score = (page) => page.locator('#result-score');

async function press(page, [x, y, dir]) {
  await tile(page, x, y).scrollIntoViewIfNeeded(); // the page may have scrolled to the result panel
  const box = await tile(page, x, y).boundingBox();
  const f = { R: [0.88, 0.5], D: [0.5, 0.88], L: [0.12, 0.5], U: [0.5, 0.12] }[dir];
  await page.mouse.move(box.x + box.width * f[0], box.y + box.height * f[1]);
  await page.mouse.down();
  await page.mouse.up();
}
const placeAll = async (page, list) => { for (const w of list) await press(page, w); };

/** `k` legal extra fences for a level: lines off its answer that keep the win and leave a route. */
function extraFences(raw, k) {
  const lv = parseLevel({ ...raw, wallBudget: 999 });
  const walls = raw.answer.map((w) => [...w]);
  const extras = [];
  for (const line of buildableLines(lv)) {
    if (extras.length === k) break;
    if (walls.some((w) => w.join(',') === line.join(','))) continue;
    const next = [...walls, line];
    if (capViolation(lv, next) !== null || cutsAllRoutes(lv, next)) continue;
    walls.push(line);
    extras.push(line);
  }
  expect(extras).toHaveLength(k);
  return extras;
}

/** The spec's formula, written out again here so the page is checked against the text, not against itself. */
const expected = (fences, par, hint = false) => Math.max(30, Math.round(100 - (70 * (fences - par)) / (2 * par))) - (hint ? 15 : 0);

/** Skip the first-visit card (unless the key is already there), so tests that are not about it start clean. */
const seedStorage = (page) => page.addInitScript((key) => {
  try {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 2, easy: {}, hard: {}, lastMode: null, seenHowTo: true }));
  } catch { /* storage blocked */ }
}, KEY);

/** "Today" is fixed with the page clock: noon on `date`, Sydney. The clock keeps running from there. */
async function setToday(page, date) {
  await page.clock.setSystemTime(NOON(date));
}

test.beforeEach(async ({ page }) => {
  await seedStorage(page);
  await page.clock.install({ time: NOON('2026-10-27') });
});

async function openDay(page, path = url('easy')) {
  await page.goto(path);
  await expect(page.locator('#board .cell').first()).toBeVisible();
}
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);

/** Wait for the gnome's walk to be over: the board unlocks (lost, tries left) or the result shows (win choice, finished day). */
const settle = (page) => expect(page.locator('#board[aria-busy="false"], #result:not([hidden])').first()).toBeAttached();
/** Press Try and wait for the try to settle before anything touches the board or reads the result. */
async function tryNow(page) {
  await tryBtn(page).click();
  await settle(page);
}

/** Press Try with whatever is on the board (an empty board loses) and wait for the try to settle. */
async function loseOnce(page, expectedLabel) {
  await expect(tryBtn(page)).toHaveText(expectedLabel);
  await tryNow(page);
}

/** Never any par on the page, in any state: shown text, hidden dialogs and attributes. */
async function expectNoPar(page) {
  const text = await page.evaluate(() => document.body.textContent + ' ' + [...document.querySelectorAll('[aria-label],[title]')].map((e) => `${e.getAttribute('aria-label')} ${e.title}`).join(' '));
  expect(text).not.toMatch(/Par/);
  expect(text).not.toMatch(/\bpar\b/i);
}

test('Easy and Hard both load for a fixed date, with the same number and the new stats row', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDay(page, '/daily/'); // no mode: Easy on a first visit
  await expect(page.locator('h1')).toHaveText('Daily #1');
  await expect(page.locator('#date-line')).toHaveText('Tue 27 Oct');
  await expect(page).toHaveTitle(/Easy #1/);
  await expect(page.locator('#board .cell')).toHaveCount(49);
  await expect(page.locator('#tab-easy')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#tab-hard')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#move-limit')).toHaveText(String(level('easy').moveLimit));
  await expect(page.locator('#moves-left')).toHaveText(String(level('easy').moveLimit));
  await expect(page.locator('#fences-used')).toHaveText('0');
  await expect(page.locator('#best-score')).toHaveText('-');
  await expect(page.locator('.stats .stat-label')).toHaveText(['Fences', 'Move limit', 'Moves left', 'Best']);
  await expect(tryBtn(page)).toHaveText('Try');
  await expect(page.locator('#clear')).toHaveText('Reset');
  await expect(hintBtn(page)).toHaveText('Hint (-15)');
  await expect(page.locator('#pips')).toHaveAttribute('aria-label', '3 tries left');
  await expect(left(page)).toHaveCount(3);
  await expect(page.locator('footer')).toHaveText('A new gnome every day.');
  await expectNoPar(page);

  await openDay(page, url('hard'));
  await expect(page.locator('h1')).toHaveText('Daily #1');
  await expect(page).toHaveTitle(/Hard #1/);
  await expect(page.locator('#board .cell')).toHaveCount(81);
  await expect(page.locator('#tab-hard')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#move-limit')).toHaveText(String(level('hard').moveLimit));
  await expectNoPar(page);

  await setToday(page, '2026-10-28');
  await openDay(page, '/daily/?mode=easy');
  await expect(page.locator('h1')).toHaveText('Daily #2');
  await expect(page.locator('#date-line')).toHaveText('Wed 28 Oct');
  expect(errors).toEqual([]);
});

test('the mode is remembered: Easy first, then the last one chosen; ?mode wins', async ({ page }) => {
  await openDay(page, '/daily/');
  await expect(page.locator('#tab-easy')).toHaveAttribute('aria-current', 'page');
  await page.locator('#tab-hard').click();
  await expect(page).toHaveURL(/mode=hard/);
  await expect(page.locator('#board .cell')).toHaveCount(81);
  expect((await saved(page)).lastMode).toBe('hard');
  await openDay(page, '/daily/'); // no mode in the URL: back to Hard
  await expect(page.locator('#tab-hard')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#board .cell')).toHaveCount(81);
  await openDay(page, '/daily/?mode=easy'); // the URL beats the memory, and becomes the memory
  await expect(page.locator('#board .cell')).toHaveCount(49);
  await openDay(page, '/daily/');
  await expect(page.locator('#tab-easy')).toHaveAttribute('aria-current', 'page');
  await openDay(page, '/daily/?mode=nonsense'); // an unknown mode falls back to the memory
  await expect(page.locator('#board .cell')).toHaveCount(49);
});

test('page meta for link previews', async ({ page }) => {
  await openDay(page);
  const meta = (sel) => page.locator(sel).getAttribute('content');
  expect(await meta('meta[property="og:title"]')).toBe('Gnome Sweet Gnome: daily puzzle');
  expect(await meta('meta[property="og:description"]')).toBe('Fence in the runaway gnome. One new puzzle a day.');
  expect(await meta('meta[property="og:url"]')).toBe('https://exempl1222.github.io/invisible-maze/daily/');
  expect(await meta('meta[name="twitter:card"]')).toBe('summary');
});

test('first visit shows how to play once, with the v2 copy, and the ? button reopens it', async ({ page }) => {
  // This test wants the first-visit state, so it clears what beforeEach seeded, once.
  await page.addInitScript(() => { if (!sessionStorage.getItem('cleared')) { sessionStorage.setItem('cleared', '1'); localStorage.clear(); } });
  await page.goto(url('easy'));
  const dlg = page.locator('#howto-dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await expect(dlg.locator('li')).toHaveCount(4);
  await expect(dlg).toContainText('as many as you like');
  await expect(dlg).toContainText('out of 100');
  await expect(dlg).toContainText('3 tries a day');
  await expect(dlg).toContainText('best one counts');
  await expect(dlg).toContainText('Easy');
  await expect(dlg).toContainText('Hard');
  await expect(dlg).not.toContainText('star');
  await expect(dlg.locator('.howto-art svg').first()).toBeVisible(); // the sprites are drawn
  await dlg.getByRole('button', { name: "Let's go" }).click();
  await expect(dlg).toBeHidden();
  expect((await saved(page)).seenHowTo).toBe(true);
  await page.reload();
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await expect(dlg).toBeHidden();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('button', { name: 'How to play' })).toBeFocused();
});

test('there is no fence limit: more fences than the old budget are allowed, and the score follows the formula', async ({ page }) => {
  const lv = level('easy');
  const extras = extraFences(lv, 4);
  await openDay(page);
  await placeAll(page, [...lv.answer, ...extras]);
  const fences = lv.answer.length + 4;
  expect(fences).toBeGreaterThan(lv.wallBudget); // the old limit was par + 2
  await expect(bars(page)).toHaveCount(fences);
  await expect(page.locator('#fences-used')).toHaveText(String(fences));
  await tryNow(page);
  await expect(result(page)).toHaveAttribute('data-state', 'review');
  await expect(score(page)).toHaveText(`${expected(fences, lv.par)} / 100`);
  await expect(page.locator('#best-score')).toHaveText(String(expected(fences, lv.par)));
  await expectNoPar(page);
});

test('the side cap and the no-cut refusal still apply', async ({ page }) => {
  const lv = level('easy');
  await openDay(page);
  // Wall every line of the board that is allowed; the page must refuse some and never let the gnome be cut off.
  const raw = parseLevel({ ...lv, wallBudget: 999 });
  for (const line of buildableLines(raw)) await press(page, line);
  const placed = await bars(page).count();
  expect(placed).toBeGreaterThan(lv.par);
  expect(placed).toBeLessThan(buildableLines(raw).length); // some were refused
  await tryNow(page);
  await expect(result(page)).not.toHaveAttribute('data-state', 'done'); // the gnome had a way, so he was fenced in or got home
});

test('a win at the stored answer scores 100, offers Retry and Submit, and Submit ends the day', async ({ page }) => {
  const lv = level('easy');
  await openDay(page);
  await placeAll(page, lv.answer);
  await tryNow(page);
  await expect(result(page)).toHaveAttribute('data-state', 'review');
  await expect(result(page).getByRole('heading', { name: 'Fenced in!' })).toBeVisible();
  await expect(score(page)).toHaveText('100 / 100');
  await expect(page.locator('#try-list li')).toHaveCount(1);
  await expect(page.locator('#try-list li').first()).toContainText('Try 1');
  await expect(page.locator('#try-list li').first()).toContainText('100');
  await expect(page.getByRole('button', { name: 'Retry for a better score (2 left)' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  await expect(page.locator('#controls')).toBeHidden();
  await expect(page.locator('#status')).toHaveText('Fenced in. 100 out of 100.');
  await expect(page.locator('#pips')).toHaveAttribute('aria-label', '2 tries left');
  expect((await saved(page)).easy['2026-10-27']).toMatchObject({ done: false });

  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(result(page)).toHaveAttribute('data-state', 'done');
  await expect(score(page)).toHaveText('100 / 100');
  await expect(page.getByRole('button', { name: 'Share' })).toBeFocused();
  await expect(page.locator('#status')).toHaveText('Day done. 100 out of 100.');
  await expect(result(page)).not.toHaveAttribute('role', 'status');
  await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0);
  expect((await saved(page)).easy['2026-10-27']).toMatchObject({ done: true, finishedOn: '2026-10-27' });
  await expectNoPar(page);

  await page.reload(); // a reload shows the same locked finished state
  await expect(result(page)).toHaveAttribute('data-state', 'done');
  await expect(score(page)).toHaveText('100 / 100');
  await expect(page.locator('#controls')).toBeHidden();
  await expect(bars(page)).toHaveCount(lv.answer.length);
  await press(page, [0, 0, 'R']); // locked
  await expect(bars(page)).toHaveCount(lv.answer.length);
  await expect(page.locator('#best-score')).toHaveText('100');
});

test('a win with extra fences scores per the formula; Retry keeps the fences and the best try counts', async ({ page }) => {
  const lv = level('easy');
  const extras = extraFences(lv, 2);
  await openDay(page);
  await placeAll(page, [...lv.answer, ...extras]);
  await tryNow(page);
  const first = expected(lv.par + 2, lv.par);
  await expect(score(page)).toHaveText(`${first} / 100`);

  await page.getByRole('button', { name: 'Retry for a better score (2 left)' }).click();
  await expect(result(page)).toBeHidden();
  await expect(page.locator('#controls')).toBeVisible();
  await expect(bars(page)).toHaveCount(lv.par + 2); // the fences stay
  await expect(tryBtn(page)).toHaveText('Try again (2 left)');
  await expect(page.locator('#best-score')).toHaveText(String(first));
  // take the two extras back and try the answer: 100
  await placeAll(page, extras);
  await expect(bars(page)).toHaveCount(lv.par);
  await tryNow(page);
  await expect(score(page)).toHaveText('100 / 100');
  await expect(page.getByRole('button', { name: 'Retry for a better score (1 left)' })).toBeVisible();

  // last try: clear the board and lose it. The day ends on its own and keeps the best score.
  await page.getByRole('button', { name: /Retry for a better score/ }).click();
  await page.locator('#clear').click();
  await expect(bars(page)).toHaveCount(0);
  await tryNow(page);
  await expect(result(page)).toHaveAttribute('data-state', 'done');
  await expect(score(page)).toHaveText('100 / 100');
  const rows = page.locator('#try-list li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveText(new RegExp(`Try 1\\s*${first}`));
  await expect(rows.nth(1)).toHaveText(/Try 2\s*100/);
  await expect(rows.nth(2)).toHaveText(/Try 3\s*He made it home/);
  await expect(bars(page)).toHaveCount(lv.par); // the board shows the best try's fences
  expect((await saved(page)).easy['2026-10-27'].tries.map((t) => t.score)).toEqual([first, 100, 0]);
});

test('a win on the last try ends the day without a Retry', async ({ page }) => {
  const lv = level('easy');
  await openDay(page);
  await loseOnce(page, 'Try');
  await loseOnce(page, 'Try again (2 left)');
  await placeAll(page, lv.answer);
  await loseOnce(page, 'Try again (1 left)');
  await expect(result(page)).toHaveAttribute('data-state', 'done');
  await expect(score(page)).toHaveText('100 / 100');
  await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0);
  await expect(page.locator('#try-list li')).toHaveCount(3);
});

test('three losses score 0 and show no answer anywhere; a reload does not give tries back', async ({ page }) => {
  await openDay(page);
  await loseOnce(page, 'Try');
  await expect(tryBtn(page)).toHaveText('Try again (2 left)');
  await expect(left(page)).toHaveCount(2);
  await expect(result(page)).toBeHidden();
  await expect(page.locator('#status')).toContainText('He made it home');
  await loseOnce(page, 'Try again (2 left)');
  await expect(tryBtn(page)).toHaveText('Try again (1 left)');
  await loseOnce(page, 'Try again (1 left)');

  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(result(page).getByRole('heading', { name: 'He made it home' })).toBeVisible();
  await expect(score(page)).toHaveText('0 / 100');
  await expect(page.locator('#try-list li')).toHaveText([/Try 1\s*He made it home/, /Try 2\s*He made it home/, /Try 3\s*He made it home/]);
  await expect(page.locator('#status')).toHaveText('He made it home. Out of tries.');
  await expect(page.locator('#answer-note')).toHaveCount(0);
  await expect(hintBars(page)).toHaveCount(0);
  await expect(bars(page)).toHaveCount(0); // nothing of the answer is drawn
  await expect(page.getByRole('button', { name: 'Share' })).toBeFocused();
  await expect(page.locator('#controls')).toBeHidden();
  await expectNoPar(page);
  await expect(page.locator('body')).not.toContainText('One way to fence him in');

  await page.reload();
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#controls')).toBeHidden();
  await expect(bars(page)).toHaveCount(0);
  await expect(left(page)).toHaveCount(0);
  await expect(page.locator('#pips')).toHaveAttribute('aria-label', '3 tries used');
  await expectNoPar(page);
  expect((await saved(page)).easy['2026-10-27']).toMatchObject({ done: true, finishedOn: '2026-10-27' });
});

test('a reload mid-day keeps tries used, the fences and the hint', async ({ page }) => {
  const lv = level('easy');
  await openDay(page);
  await loseOnce(page, 'Try'); // try 1 spent
  await expect(tryBtn(page)).toHaveText('Try again (2 left)');
  await hintBtn(page).click();
  await expect(hintBars(page)).toHaveCount(1);
  const hintLine = await hintBars(page).getAttribute('data-line');
  const other = extraFences(lv, 1)[0];
  await press(page, other);
  await expect(bars(page)).toHaveCount(2);

  await page.reload();
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await expect(tryBtn(page)).toHaveText('Try again (2 left)');
  await expect(left(page)).toHaveCount(2);
  await expect(bars(page)).toHaveCount(2);
  await expect(hintBars(page)).toHaveCount(1);
  await expect(hintBars(page)).toHaveAttribute('data-line', hintLine);
  await expect(hintBtn(page)).toHaveText('Hint used');
  await expect(hintBtn(page)).toBeDisabled();
  await expect(result(page)).toBeHidden();
});

test('reloading on the win screen shows the choice again and does not give the try back', async ({ page }) => {
  const lv = level('easy');
  await openDay(page);
  await placeAll(page, lv.answer);
  await tryNow(page);
  await expect(result(page)).toHaveAttribute('data-state', 'review');
  await page.reload();
  await expect(result(page)).toHaveAttribute('data-state', 'review');
  await expect(score(page)).toHaveText('100 / 100');
  await expect(page.getByRole('button', { name: 'Retry for a better score (2 left)' })).toBeVisible();
  await expect(bars(page)).toHaveCount(lv.answer.length);
  await expect(page.locator('#controls')).toBeHidden();
});

test('reloading right after pressing Try cannot give the try back', async ({ page }) => {
  await openDay(page);
  await tryNow(page);
  await page.reload();
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await expect(tryBtn(page)).toHaveText('Try again (2 left)');
  await expect(left(page)).toHaveCount(2);
});

test.describe('with the walk animation on', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('a reload in the middle of the gnome\'s walk cannot give the try back', async ({ page }) => {
    await openDay(page);
    await tryBtn(page).click();
    await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'true'); // the board is locked: the walk is on
    await expect(tryBtn(page)).toBeDisabled();
    await page.reload();
    await expect(page.locator('#board .cell').first()).toBeVisible();
    await expect(tryBtn(page)).toHaveText('Try again (2 left)');
    await expect(left(page)).toHaveCount(2);
    expect((await saved(page)).easy['2026-10-27'].tries).toHaveLength(1);
  });
});

test('the hint costs 15 points, can be used once, stays through Reset, and shows in the share text', async ({ page }) => {
  await stubShare(page, 'share');
  const lv = level('easy');
  await openDay(page);
  await expect(hintBtn(page)).toHaveText('Hint (-15)');
  await hintBtn(page).click();
  await expect(hintBars(page)).toHaveCount(1);
  await expect(hintBtn(page)).toHaveText('Hint used');
  await expect(hintBtn(page)).toBeDisabled();
  // A hint fence stays: tapping it again does not remove it, and Reset keeps it.
  const hintLine = await hintBars(page).getAttribute('data-line');
  const [hx, hy, hd] = hintLine.split(',');
  await press(page, [Number(hx), Number(hy), hd]);
  await expect(hintBars(page)).toHaveCount(1);
  await press(page, extraFences(lv, 1)[0]);
  await page.locator('#clear').click();
  await expect(hintBars(page)).toHaveCount(1);
  await expect(bars(page)).toHaveCount(1);
  // Finish with par fences in total: 100 minus 15 for the hint.
  await placeAll(page, lv.answer.filter((w) => w.join(',') !== hintLine));
  await tryNow(page);
  await expect(score(page)).toHaveText('85 / 100');
  await expect(page.locator('#hint-used')).toHaveText('Hint used, -15 points.');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('button', { name: 'Share' }).click();
  const shared = await page.evaluate(() => window.__shared);
  expect(shared[0].text).toBe(['Gnome Sweet Gnome #1 Easy 🍄', '85/100 💡', '🟩', new URL('/daily/?mode=easy', page.url()).toString()].join('\n'));
});

test('a hint used after a win takes 15 off that win too (every winning try that day)', async ({ page }) => {
  const lv = level('easy');
  await openDay(page);
  await placeAll(page, lv.answer);
  await tryNow(page);
  await expect(score(page)).toHaveText('100 / 100');
  await page.getByRole('button', { name: /Retry/ }).click();
  await page.locator('#clear').click();
  await hintBtn(page).click();
  await expect(page.locator('#best-score')).toHaveText('85');
  await tryNow(page); // lose with the hint fence only
  await expect(tryBtn(page)).toHaveText('Try again (1 left)');
  await expect(page.locator('#best-score')).toHaveText('85');
});

const stubShare = (page, mode) => page.addInitScript((m) => {
  window.__shared = [];
  window.__copied = [];
  const nav = (name, value) => Object.defineProperty(navigator, name, { value, configurable: true });
  nav('share', m === 'share' ? async (d) => { window.__shared.push(d); }
    : m === 'abort' ? async () => { throw new DOMException('closed', 'AbortError'); } : undefined);
  nav('clipboard', m === 'fail' ? { writeText: async () => { throw new Error('no'); } } : { writeText: async (t) => { window.__copied.push(t); } });
}, mode);
const shareUrl = (page, mode) => new URL(`/daily/?mode=${mode}`, page.url()).toString();

test('share text, Easy: mode name, score, squares and the ?mode URL', async ({ page }) => {
  await stubShare(page, 'share');
  const lv = level('easy');
  const extras = extraFences(lv, 1);
  await openDay(page);
  await loseOnce(page, 'Try');
  await placeAll(page, [...lv.answer, ...extras]);
  await tryNow(page);
  await page.getByRole('button', { name: /Retry/ }).click();
  await placeAll(page, extras); // back to par
  await tryNow(page);
  await expect(result(page)).toHaveAttribute('data-state', 'done');
  await page.getByRole('button', { name: 'Share' }).click();
  const shared = await page.evaluate(() => window.__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0].text).toBe(['Gnome Sweet Gnome #1 Easy 🍄', '100/100', '🟥🟩🟩', shareUrl(page, 'easy')].join('\n'));
});

test('share text, Hard: a day with no win is copied as 0/100 with the house when navigator.share is missing', async ({ page }) => {
  await stubShare(page, 'clipboard');
  await openDay(page, url('hard'));
  await loseOnce(page, 'Try');
  await loseOnce(page, 'Try again (2 left)');
  await loseOnce(page, 'Try again (1 left)');
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.locator('#share-note')).toHaveText('Copied');
  const copied = await page.evaluate(() => window.__copied);
  expect(copied).toEqual([['Gnome Sweet Gnome #1 Hard 🍄', '0/100 🏠', '🟥🟥🟥', shareUrl(page, 'hard')].join('\n')]);
});

test('if sharing and copying both fail, the text is shown in a selectable box', async ({ page }) => {
  await stubShare(page, 'fail');
  await openDay(page);
  await placeAll(page, level('easy').answer);
  await tryNow(page);
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('button', { name: 'Share' }).click();
  const box = page.locator('#share-box');
  await expect(box).toBeVisible();
  await expect(box).toHaveValue(/^Gnome Sweet Gnome #1 Easy 🍄\n100\/100\n🟩\nhttp.*\/daily\/\?mode=easy$/);
});

test('closing the share sheet (AbortError) shows no note, no box, and does not touch the clipboard', async ({ page }) => {
  await stubShare(page, 'abort');
  await page.addInitScript(() => {
    const clip = navigator.clipboard;
    navigator.clipboard.writeText = async (t) => { window.__copied.push(t); return clip; };
  });
  await openDay(page);
  await placeAll(page, level('easy').answer);
  await tryNow(page);
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('button', { name: 'Share' }).click();
  await page.waitForTimeout(150);
  await expect(page.locator('#share-note')).toHaveText('');
  await expect(page.locator('#share-box')).toBeHidden();
  expect(await page.evaluate(() => window.__copied)).toEqual([]);
});

/** Win a day at par and Submit. */
async function winDay(page, mode, i, path) {
  await openDay(page, path);
  await placeAll(page, level(mode, i).answer);
  await tryNow(page);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(result(page)).toHaveAttribute('data-state', 'done');
}

const statsCell = (page, label) => page.locator('#stats-dlg .stats-grid div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');

test('streaks and stats are per mode: Easy two days in a row, Hard only one', async ({ page }) => {
  await winDay(page, 'easy', 0, url('easy'));
  await setToday(page, '2026-10-28');
  await winDay(page, 'easy', 1, url('easy'));
  await winDay(page, 'hard', 1, url('hard'));

  await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
  const dlg = page.locator('#stats-dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('tab', { name: 'Hard' })).toHaveAttribute('aria-selected', 'true'); // opens on the mode on screen
  await expect(statsCell(page, 'Played')).toHaveText('1');
  await expect(statsCell(page, 'Win %')).toHaveText('100');
  await expect(statsCell(page, 'Average')).toHaveText('100');
  await expect(statsCell(page, 'Best')).toHaveText('100');
  await expect(statsCell(page, 'Streak')).toHaveText('1');
  await expect(statsCell(page, 'Best streak')).toHaveText('1');
  await dlg.getByRole('tab', { name: 'Easy' }).click();
  await expect(dlg.getByRole('tab', { name: 'Easy' })).toBeFocused();
  await expect(statsCell(page, 'Played')).toHaveText('2');
  await expect(statsCell(page, 'Streak')).toHaveText('2');
  await expect(statsCell(page, 'Best streak')).toHaveText('2');
  const bands = dlg.locator('.dist li');
  await expect(bands).toHaveCount(6);
  await expect(bands.nth(0)).toContainText('100');
  await expect(bands.nth(1)).toContainText('80 to 99');
  await expect(bands.nth(2)).toContainText('60 to 79');
  await expect(bands.nth(3)).toContainText('30 to 59');
  await expect(bands.nth(4)).toContainText('1 to 29');
  await expect(bands.nth(5)).toContainText('0');
  await expect(bands.nth(0).locator('.bar')).toHaveText('2');
  await expect(dlg.locator('.dist li.today')).toHaveCount(1);
  await expect(dlg.locator('.dist li.today')).toContainText('100');
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(dlg).toBeHidden();

  // Two days on, with Easy not played: the Easy streak ended; Hard's is long gone too.
  await setToday(page, '2026-10-31');
  await openDay(page, '/daily/?mode=easy');
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(statsCell(page, 'Streak')).toHaveText('0');
  await expect(statsCell(page, 'Best streak')).toHaveText('2');
});

test('a day with no win counts as played with a score of 0 and ends only that mode\'s streak', async ({ page }) => {
  await winDay(page, 'easy', 0, url('easy'));
  await setToday(page, '2026-10-28');
  await openDay(page, url('easy'));
  await loseOnce(page, 'Try');
  await loseOnce(page, 'Try again (2 left)');
  await loseOnce(page, 'Try again (1 left)');
  await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
  await expect(statsCell(page, 'Played')).toHaveText('2');
  await expect(statsCell(page, 'Win %')).toHaveText('50');
  await expect(statsCell(page, 'Average')).toHaveText('50');
  await expect(statsCell(page, 'Streak')).toHaveText('0');
  await expect(statsCell(page, 'Best streak')).toHaveText('1');
  await expect(page.locator('#stats-dlg .dist li.today')).toContainText('0');
});

test('v1 saved data migrates into Hard: scored from its walls, Easy untouched', async ({ page }) => {
  const lv = level('hard', 0);
  const lv2 = level('hard', 1);
  const v1 = {
    v: 1,
    seenHowTo: true,
    days: {
      '2026-10-27': { tries: 2, won: true, stars: 3, walls: lv.answer.map((w) => w.join(',')), hint: null, done: true, finishedOn: '2026-10-27' },
      '2026-10-28': { tries: 3, won: false, stars: 0, walls: [], hint: null, done: true, finishedOn: '2026-10-28' },
    },
  };
  await page.addInitScript(([k2, k1, old]) => {
    if (sessionStorage.getItem('migrated')) return;
    sessionStorage.setItem('migrated', '1');
    localStorage.removeItem(k2); // beforeEach seeded a v2 save; this test starts from v1 only
    localStorage.setItem(k1, JSON.stringify(old));
  }, [KEY, V1_KEY, v1]);
  await setToday(page, '2026-10-28');
  await openDay(page, url('hard', '2026-10-27'));
  await expect(result(page)).toHaveAttribute('data-state', 'done');
  await expect(score(page)).toHaveText('100 / 100'); // par fences, no hint
  await expect(page.locator('#howto-dlg')).toBeHidden(); // seenHowTo carried over
  const s = await saved(page);
  expect(s.hard['2026-10-27']).toMatchObject({ done: true, finishedOn: '2026-10-27' });
  expect(s.hard['2026-10-27'].tries).toHaveLength(1);
  expect(s.hard['2026-10-27'].tries[0]).toMatchObject({ won: true, score: 100, fences: lv.answer.length });
  expect(s.hard['2026-10-28'].tries).toHaveLength(3);
  expect(s.easy).toEqual({});
  expect(await page.evaluate((k) => localStorage.getItem(k) !== null, V1_KEY)).toBe(true); // v1 is left in place

  await openDay(page, url('hard')); // 28 Oct: the migrated loss
  await expect(score(page)).toHaveText('0 / 100');
  await page.getByRole('button', { name: 'Archive' }).click();
  const rows = page.locator('#archive-dlg .arch-row');
  await expect(rows.nth(0)).toContainText('Easy - · Hard 0');
  await expect(rows.nth(1)).toContainText('Easy - · Hard 100');
  void lv2;
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
  await expect(statsCell(page, 'Played')).toHaveText('2');
  await page.keyboard.press('Escape');
  await openDay(page, url('easy')); // Easy has nothing
  await expect(tryBtn(page)).toHaveText('Try');
  await expect(left(page)).toHaveCount(3);
});

test('the countdown shows after the day is done, then offers a new gnome at midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T18:48:00+11:00') });
  await page.goto(url('easy'));
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await expect(page.locator('#countdown')).toHaveCount(0);
  await placeAll(page, level('easy').answer);
  await tryNow(page);
  await expect(page.locator('#countdown')).toHaveCount(0); // not done until Submit
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('#countdown')).toHaveText('Next gnome in 5h 12m');
  await page.clock.runFor('01:00:00');
  await expect(page.locator('#countdown')).toHaveText('Next gnome in 4h 12m');
  await page.clock.runFor('04:12:30');
  await expect(page.locator('#countdown')).toHaveText('A new gnome is here');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('a tab left open past midnight on an unfinished today offers the new gnome; coming back to the tab re-ticks', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-27T23:50:00+11:00'));
  await openDay(page);
  await expect(page.locator('#new-day')).toBeHidden();
  await page.clock.runFor('00:15:00');
  await expect(page.locator('#new-day')).toBeVisible();
  await expect(page.locator('#new-day')).toContainText('A new gnome is here');
  await page.locator('#new-day-play').click();
  await expect(page.locator('h1')).toHaveText('Daily #2');
  await expect(page).toHaveURL(/mode=easy/);
});

test('the countdown catches up when the tab becomes visible again', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-27T18:48:00+11:00'));
  await openDay(page);
  await placeAll(page, level('easy').answer);
  await tryNow(page);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('#countdown')).toHaveText('Next gnome in 5h 12m');
  await page.clock.pauseAt(new Date('2026-10-27T20:00:00+11:00')); // time jumps with no timer firing, like a sleeping tab
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#countdown')).toHaveText('Next gnome in 4h 0m');
});

test('the break message shows for a day before the batch, with a way back to today but none to the game', async ({ page }) => {
  await page.goto('/daily/?date=2026-10-26'); // in the archive window, but there is no puzzle
  await expect(page.getByText('The daily is taking a break.')).toBeVisible();
  await expect(page.locator('#game-view')).toBeHidden();
  await expect(page.locator('main a:visible')).toHaveCount(2); // only the Easy | Hard tabs
  await expect(page.locator('#wordmark')).not.toHaveJSProperty('tagName', 'A');
});

test('a future date is not ready, with a button to today', async ({ page }) => {
  await page.goto('/daily/?date=2099-12-31');
  await expect(page.getByText('Not ready yet. This gnome is still packing.')).toBeVisible();
  await expect(page.locator('#game-view')).toBeHidden();
  await expect(page.locator('#tries')).toBeHidden();
  await page.locator('#break-today').click();
  await expect(page).toHaveURL(/\/daily\/\?mode=easy$/);
  await expect(page.locator('h1')).toHaveText('Daily #1');
});

for (const date of ['2026-09-27', '2020-01-01', 'not-a-date', '2026-02-30', '']) {
  test(`?date=${date || '(empty)'} is out of the archive, with a button to today`, async ({ page }) => {
    await page.goto(`/daily/?date=${date}`);
    await expect(page.getByText('That day is out of the archive.')).toBeVisible();
    await expect(page.locator('#game-view')).toBeHidden();
    await page.locator('#break-today').click();
    await expect(page.locator('h1')).toHaveText('Daily #1');
  });
}

test('the oldest playable day is today minus 29', async ({ page }) => {
  await setToday(page, '2026-11-25'); // 27 Oct is 29 days back; 26 Oct would be 30
  await page.goto('/daily/?date=2026-10-27');
  await expect(page.locator('h1')).toContainText('Daily #1');
  await page.goto('/daily/?date=2026-10-26');
  await expect(page.getByText('That day is out of the archive.')).toBeVisible();
});

test('nothing links to the full game while the app link is off', async ({ page }) => {
  await openDay(page);
  await expect(page.locator('a')).toHaveCount(2); // the Easy | Hard tabs, both inside the daily
  for (const a of await page.locator('a').all()) expect(await a.getAttribute('href')).toMatch(/\/daily\/\?mode=/);
  await expect(page.locator('#wordmark')).not.toHaveJSProperty('tagName', 'A');
  await placeAll(page, level('easy').answer);
  await tryNow(page);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(result(page)).toHaveAttribute('data-state', 'done');
  await expect(page.locator('a')).toHaveCount(2);
  await expect(page.locator('body')).not.toContainText('Want more');
});

test('corrupt saved data is ignored and the page still works', async ({ page }) => {
  await page.addInitScript((k) => { localStorage.setItem(k, '{broken json'); }, KEY);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDay(page);
  await expect(tryBtn(page)).toHaveText('Try');
  await expect(page.locator('#howto-dlg')).toBeVisible(); // nothing saved, so it counts as a first visit
  expect(errors).toEqual([]);
});

test('no horizontal scroll at 390px, and every control is at least 44px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDay(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const b of await page.locator('button:visible:not(.cell), main a:visible').all()) {
    const box = await b.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await placeAll(page, level('easy').answer);
  await tryNow(page);
  await expect(result(page)).toHaveAttribute('data-state', 'review');
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const b of await result(page).locator('button:visible').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Submit' }).click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const b of await result(page).locator('button:visible').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  for (const name of ['How to play', 'Stats']) {
    await page.getByRole('button', { name, exact: true }).first().click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    const dlgBox = await page.locator('dialog[open]').boundingBox();
    expect(dlgBox.x).toBeGreaterThanOrEqual(16 - 1);
    expect(dlgBox.x + dlgBox.width).toBeLessThanOrEqual(390 - 16 + 1);
    for (const b of await page.locator('dialog[open] button:visible').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
  }
});

test('Hard also fits at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDay(page, url('hard'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('no par text anywhere on the page: loaded, mid-game, win choice, finished, lost and every dialog', async ({ page }) => {
  const lv = level('hard');
  await openDay(page, url('hard'));
  await expectNoPar(page);
  await placeAll(page, lv.answer.slice(0, 1));
  await hintBtn(page).click();
  await expectNoPar(page);
  await page.locator('#clear').click();
  await placeAll(page, lv.answer);
  await tryNow(page);
  await expectNoPar(page);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expectNoPar(page);
  await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
  await expectNoPar(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Archive' }).click();
  await expectNoPar(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'How to play' }).click();
  await expectNoPar(page);
});

/* ---------- the archive ---------- */

test.describe('the archive', () => {
  // Today is Fri 30 Oct, #4. The days before it back to the batch start (27 Oct) are the archive.
  test.beforeEach(async ({ page }) => { await setToday(page, '2026-10-30'); });
  const ARCHIVE = (mode) => url(mode, '2026-10-28'); // #2

  test('the dialog lists today first, marked, with each day\'s number, date and both scores', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDay(page, url('easy'));
    await expect(page.locator('h1')).toHaveText('Daily #4');
    await expect(page.locator('.tag')).toHaveCount(0);
    await expect(page.locator('#today-link')).toBeHidden();
    await page.getByRole('button', { name: 'Archive' }).click();
    const dlg = page.locator('#archive-dlg');
    await expect(dlg).toBeVisible();
    const rows = dlg.locator('.arch-row');
    await expect(rows).toHaveCount(4); // 30 Oct back to 27 Oct; nothing before the batch
    await expect(rows.nth(0)).toContainText('#4');
    await expect(rows.nth(0)).toContainText('Fri 30 Oct');
    await expect(rows.nth(0)).toContainText('Today');
    await expect(rows.nth(3)).toContainText('#1');
    await expect(rows.nth(3)).toContainText('Tue 27 Oct');
    await expect(dlg.locator('.arch-today')).toHaveCount(1);
    await expect(rows.nth(1)).toContainText('Easy - · Hard -');
    for (const r of await rows.all()) expect((await r.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const box = await dlg.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(15);
    expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('button', { name: 'Archive' })).toBeFocused();
  });

  test('tapping a past day goes there in the same mode: Archive tag, a way back to today', async ({ page }) => {
    await openDay(page, url('hard'));
    await page.getByRole('button', { name: 'Archive' }).click();
    await page.locator('#archive-dlg .arch-row[data-date="2026-10-28"]').click();
    await expect(page).toHaveURL(/mode=hard&date=2026-10-28$/);
    await expect(page.locator('h1')).toContainText('Daily #2');
    await expect(page.locator('h1 .tag')).toHaveText('Archive');
    await expect(page.locator('#date-line')).toHaveText('Wed 28 Oct');
    await expect(page.locator('#board .cell')).toHaveCount(81);
    await expect(page.locator('#tab-easy')).toHaveAttribute('href', /\/daily\/\?mode=easy&date=2026-10-28$/);
    await page.getByRole('button', { name: "Today's gnome" }).click();
    await expect(page.locator('h1')).toHaveText('Daily #4');
    await expect(page.locator('#board .cell')).toHaveCount(81);
  });

  test('a past day plays for real and is saved; it counts as played but not toward the streak; the share says (archive)', async ({ page }) => {
    await stubShare(page, 'share');
    await winDay(page, 'easy', 1, ARCHIVE('easy'));
    expect((await saved(page)).easy['2026-10-28']).toMatchObject({ done: true, finishedOn: '2026-10-30' });

    await page.reload(); // locked and finished on reload, like today
    await expect(result(page)).toHaveAttribute('data-state', 'done');
    await expect(page.locator('#controls')).toBeHidden();

    await page.getByRole('button', { name: 'Share' }).click();
    const shared = await page.evaluate(() => window.__shared);
    expect(shared[0].text.split('\n')[0]).toBe('Gnome Sweet Gnome #2 (archive) Easy 🍄');
    expect(shared[0].text.split('\n')[3]).toBe(shareUrl(page, 'easy'));

    await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
    await expect(statsCell(page, 'Played')).toHaveText('1');
    await expect(statsCell(page, 'Win %')).toHaveText('100');
    await expect(statsCell(page, 'Streak')).toHaveText('0');
    await expect(statsCell(page, 'Best streak')).toHaveText('0');
    await expect(page.locator('#stats-dlg .dist li').first().locator('.bar')).toHaveText('1');
    await expect(page.locator('#stats-dlg .dist li.today')).toHaveCount(0); // today itself is not done
    await page.keyboard.press('Escape');

    // The archive row shows both modes, and a win on the day itself starts a streak of 1.
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.locator('#archive-dlg .arch-row[data-date="2026-10-28"]')).toContainText('Easy 100 · Hard -');
    await page.keyboard.press('Escape');
    await winDay(page, 'easy', 3, url('easy'));
    await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
    await expect(statsCell(page, 'Played')).toHaveText('2');
    await expect(statsCell(page, 'Streak')).toHaveText('1');
    await expect(statsCell(page, 'Best streak')).toHaveText('1');
  });

  test('catching up a missed day in the archive does not repair the streak', async ({ page }) => {
    await setToday(page, '2026-10-28');
    await winDay(page, 'hard', 1, url('hard')); // #2, won on the day
    await setToday(page, '2026-10-30'); // 29 Oct missed
    await winDay(page, 'hard', 2, url('hard', '2026-10-29'));
    await winDay(page, 'hard', 3, url('hard'));
    await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
    await expect(statsCell(page, 'Played')).toHaveText('3');
    await expect(statsCell(page, 'Streak')).toHaveText('1');
    await expect(statsCell(page, 'Best streak')).toHaveText('1');
  });

  test('a lost archive day shows 0 in the list for that mode; a day in progress shows ...', async ({ page }) => {
    await openDay(page, ARCHIVE('easy'));
    await loseOnce(page, 'Try');
    await openDay(page, url('hard', '2026-10-29'));
    await loseOnce(page, 'Try');
    await loseOnce(page, 'Try again (2 left)');
    await loseOnce(page, 'Try again (1 left)');
    await expect(result(page)).toHaveAttribute('data-result', 'lose');
    await page.getByRole('button', { name: 'Archive' }).click();
    const row = (d) => page.locator(`#archive-dlg .arch-row[data-date="${d}"]`);
    await expect(row('2026-10-28')).toContainText('Easy ... · Hard -');
    await expect(row('2026-10-29')).toContainText('Easy - · Hard 0');
  });
});

/* ---------- two tabs ---------- */

async function staleTab(page, context) {
  const b = await context.newPage();
  await seedStorage(b);
  // Tab B ignores the storage event, so it is stale and has to re-read before it writes.
  await b.addInitScript(() => window.addEventListener('storage', (e) => e.stopImmediatePropagation(), true));
  await b.clock.install({ time: NOON('2026-10-27') });
  await openDay(b);
  return b;
}

test('two tabs: tries spent in one are not lost when the other presses Try, and the first catches up', async ({ page, context }) => {
  await openDay(page); // tab A
  const b = await staleTab(page, context);

  await loseOnce(page, 'Try');
  await loseOnce(page, 'Try again (2 left)');
  await expect(tryBtn(page)).toHaveText('Try again (1 left)');
  expect((await saved(page)).easy['2026-10-27'].tries).toHaveLength(2);

  await expect(tryBtn(b)).toHaveText('Try'); // B still thinks nothing was spent
  await tryNow(b);
  await expect(result(b)).toHaveAttribute('data-result', 'lose'); // B's press landed on top of A's two tries
  expect((await saved(page)).easy['2026-10-27']).toMatchObject({ done: true });
  expect((await saved(page)).easy['2026-10-27'].tries).toHaveLength(3);

  // A hears about it through the storage event and shows the finished day.
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#controls')).toBeHidden();
  await expect(left(page)).toHaveCount(0);
  await b.close();
});

test('two tabs: a submitted day in one locks the other, and a stale tab cannot play a finished day', async ({ page, context }) => {
  await openDay(page);
  const b = await staleTab(page, context);
  await placeAll(page, level('easy').answer);
  await tryNow(page);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(result(page)).toHaveAttribute('data-state', 'done');
  await tryNow(b); // stale B presses Try on a day A already finished
  await expect(result(b)).toHaveAttribute('data-state', 'done');
  await expect(b.locator('#result-score')).toHaveText('100 / 100');
  expect((await saved(page)).easy['2026-10-27'].tries).toHaveLength(1);
  await b.close();
});

test('two tabs: the longer tries list wins, Easy and Hard saves do not touch each other', async ({ page, context }) => {
  await openDay(page, url('easy'));
  const b = await context.newPage();
  await seedStorage(b);
  await b.clock.install({ time: NOON('2026-10-27') });
  await openDay(b, url('hard'));
  await loseOnce(page, 'Try');
  await loseOnce(b, 'Try');
  await loseOnce(b, 'Try again (2 left)');
  const s = await saved(page);
  expect(s.easy['2026-10-27'].tries).toHaveLength(1);
  expect(s.hard['2026-10-27'].tries).toHaveLength(2);
  await b.close();
});

/* ---------- storage that throws ---------- */

for (const how of ['methods throw', 'the localStorage getter throws']) {
  test(`when storage is blocked (${how}) the page still plays`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === 'methods throw') {
        Storage.prototype.getItem = () => { throw new Error('blocked'); };
        Storage.prototype.setItem = () => { throw new Error('blocked'); };
      } else {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
      }
    }, how);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url('easy'));
    await expect(page.locator('#board .cell').first()).toBeVisible();
    await page.locator('#howto-close').click(); // nothing can be remembered, so it is a first visit
    await loseOnce(page, 'Try');
    await expect(tryBtn(page)).toHaveText('Try again (2 left)'); // memory still counts the try
    await placeAll(page, level('easy').answer);
    await tryNow(page);
    await expect(result(page)).toHaveAttribute('data-state', 'review');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(score(page)).toHaveText('100 / 100');
    await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
    await expect(page.locator('#stats-dlg')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
