// The standalone daily page (daily/index.html, docs/DAILY_SPEC.md, "v2: Easy and Hard, scored out of 100").
// Answers come from daily-easy.json and daily.json and are pressed into the real page. The gnome's walk is
// skipped (reduced motion) so tests stay fast; the animation itself is covered by play.spec.js.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { handle } from '../worker/src/handle.js';
import { fakeD1 } from '../tools/worker-fake-d1.js';
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
/** Place each fence and wait for it to appear, so a click that missed fails here, not later. */
async function placeAll(page, list) {
  await page.evaluate(() => document.fonts.ready); // web fonts can shift the board after it first shows
  for (const w of list) {
    const before = await bars(page).count();
    await press(page, w);
    await expect(page.locator(`#board .wall-bar[data-line="${w.join(',')}"]`)).toHaveCount(1);
    await expect(bars(page)).toHaveCount(before + 1);
  }
}

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

/**
 * A fresh page in the same browser context (so the same saved data) whose clock starts at noon on `date`.
 * Use this rather than setToday when a test moves "today" between page loads: on CI's Playwright 1.56,
 * changing the faked time on a page that then loads again can leave the gnome's walk stuck.
 */
async function pageAt(context, date) {
  const p = await context.newPage();
  await p.emulateMedia({ reducedMotion: 'reduce' }); // see beforeEach
  await seedStorage(p);
  await p.clock.install({ time: NOON(date) });
  return p;
}

test.beforeEach(async ({ page, reducedMotion }) => {
  // test.use alone wasn't applied on CI's Playwright 1.56, so set it on the page too (whatever this test asked for).
  await page.emulateMedia({ reducedMotion });
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
  // If reduced motion isn't applied (CI's Playwright 1.56 ignored test.use), the walk animates on the faked
  // clock: a 9x9 win is about 20 steps x 220ms. Advance well past it so the walk always settles.
  await page.clock.runFor(8000);
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

test('reduced motion is really on in the page (CI once ignored it, which made Hard walks outlast the test clock)', async ({ page }) => {
  await openDay(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
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
  await expect.poll(async () => (await saved(page))?.seenHowTo).toBe(true);
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

test('a win at the stored answer scores 100, offers Submit only, and Submit ends the day', async ({ page }) => {
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
  // 100 can't be beaten: Submit is the only button, and there is no "fewer fences" note
  await expect(page.getByRole('button', { name: 'Submit' })).toBeFocused();
  await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0);
  await expect(page.locator('#try-note')).toHaveCount(0);
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

test('a win below the max offers Retry and Submit with the note; Retry keeps the fences and the best try counts', async ({ page }) => {
  const lv = level('easy');
  const extras = extraFences(lv, 2);
  await openDay(page);
  await placeAll(page, [...lv.answer, ...extras]);
  await tryNow(page);
  const first = expected(lv.par + 2, lv.par);
  await expect(score(page)).toHaveText(`${first} / 100`);
  await expect(page.locator('#try-note')).toHaveText('Fewer fences score higher.');
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();

  await page.getByRole('button', { name: 'Retry for a better score (2 left)' }).click();
  await expect(result(page)).toBeHidden();
  await expect(page.locator('#controls')).toBeVisible();
  await expect(bars(page)).toHaveCount(lv.par + 2); // the fences stay
  await expect(tryBtn(page)).toHaveText('Try again (2 left)');
  await expect(page.locator('#best-score')).toHaveText(String(first));
  // take one extra back: a better score, still below 100, so Retry is offered again
  await press(page, extras[0]);
  await expect(bars(page)).toHaveCount(lv.par + 1);
  await tryNow(page);
  const second = expected(lv.par + 1, lv.par);
  await expect(score(page)).toHaveText(`${second} / 100`);
  await expect(page.getByRole('button', { name: 'Retry for a better score (1 left)' })).toBeVisible();

  // last try: clear the board and lose it. The day ends on its own and keeps the best score.
  await page.getByRole('button', { name: /Retry for a better score/ }).click();
  await page.locator('#clear').click();
  await expect(bars(page)).toHaveCount(0);
  await tryNow(page);
  await expect(result(page)).toHaveAttribute('data-state', 'done');
  await expect(score(page)).toHaveText(`${second} / 100`);
  const rows = page.locator('#try-list li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveText(new RegExp(`Try 1\\s*${first}`));
  await expect(rows.nth(1)).toHaveText(new RegExp(`Try 2\\s*${second}`));
  await expect(rows.nth(2)).toHaveText(/Try 3\s*He made it home/);
  await expect(bars(page)).toHaveCount(lv.par + 1); // the board shows the best try's fences
  const day = (await saved(page)).easy['2026-10-27'];
  expect(day.tries.map((t) => t.base)).toEqual([first, second, 0]);
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
  const extra = extraFences(lv, 1);
  await openDay(page);
  await placeAll(page, [...lv.answer, ...extra]);
  await tryNow(page);
  await expect(result(page)).toHaveAttribute('data-state', 'review');
  await page.reload();
  await expect(result(page)).toHaveAttribute('data-state', 'review');
  await expect(score(page)).toHaveText(`${expected(lv.par + 1, lv.par)} / 100`);
  await expect(page.getByRole('button', { name: 'Retry for a better score (2 left)' })).toBeVisible();
  await expect(bars(page)).toHaveCount(lv.answer.length + 1);
  await expect(page.locator('#controls')).toBeHidden();
});

test('reloading while editing after Retry reopens the editor with the current fences, not the win screen', async ({ page }) => {
  const lv = level('easy');
  const extras = extraFences(lv, 2);
  await openDay(page);
  await placeAll(page, [...lv.answer, ...extras]);
  await tryNow(page);
  await page.getByRole('button', { name: /Retry for a better score/ }).click();
  await press(page, extras[0]); // take one fence back, then reload before trying
  await expect(bars(page)).toHaveCount(lv.par + 1);
  await page.reload();
  await expect(result(page)).toBeHidden();
  await expect(page.locator('#controls')).toBeVisible();
  await expect(bars(page)).toHaveCount(lv.par + 1);
  await expect(tryBtn(page)).toHaveText('Try again (2 left)');
  await expect(tryBtn(page)).toBeEnabled();
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

test('a hint used after a win still costs 15 after a reload, a Submit, in the stats and in the share text', async ({ page }) => {
  await stubShare(page, 'share');
  const lv = level('easy');
  const extra = extraFences(lv, 1)[0];
  await openDay(page);
  await placeAll(page, [...lv.answer, extra]);
  await tryNow(page);
  const first = expected(lv.par + 1, lv.par);
  await expect(score(page)).toHaveText(`${first} / 100`);
  await page.getByRole('button', { name: /Retry/ }).click();
  await hintBtn(page).click(); // every answer fence is down: one of them becomes the hint, and the hint is spent
  await expect(hintBars(page)).toHaveCount(1);
  await expect(hintBtn(page)).toHaveText('Hint used');
  await expect(page.locator('#best-score')).toHaveText(String(first - 15));
  await page.reload(); // the docked score must come back from storage, not from memory
  await expect(page.locator('#controls')).toBeVisible();
  await expect(hintBars(page)).toHaveCount(1);
  await expect(page.locator('#best-score')).toHaveText(String(first - 15));
  // take the extra fence back: the answer alone is base 100, shown 85, the most a hinted day can score
  await press(page, extra);
  await expect(bars(page)).toHaveCount(lv.par);
  await tryNow(page);
  await expect(score(page)).toHaveText('85 / 100');
  await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0); // 85 is the max with the hint
  await page.reload();
  await expect(score(page)).toHaveText('85 / 100');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(score(page)).toHaveText('85 / 100');
  const day = (await saved(page)).easy['2026-10-27'];
  expect(day.hint).not.toBeNull();
  expect(day.tries.map((t) => t.base)).toEqual([first, 100]);
  await page.reload();
  await expect(score(page)).toHaveText('85 / 100');
  await expect(page.locator('#best-score')).toHaveText('85');
  await page.getByRole('button', { name: 'Share' }).click();
  expect((await page.evaluate(() => window.__shared))[0].text).toContain('85/100 💡');
  await page.locator('#result-stats-btn').click();
  const dlg = page.locator('#stats-dlg');
  await expect(statsCell(page, 'Best')).toHaveText('85');
  await expect(statsCell(page, 'Average')).toHaveText('85');
});

test('the hint is not a free answer check: with every answer fence down it marks one as the hint and is spent', async ({ page }) => {
  const lv = level('easy');
  await openDay(page);
  await placeAll(page, lv.answer);
  await expect(hintBars(page)).toHaveCount(0);
  await hintBtn(page).click();
  await expect(hintBars(page)).toHaveCount(1);
  await expect(bars(page)).toHaveCount(lv.par);
  await expect(hintBtn(page)).toHaveText('Hint used');
  await expect(hintBtn(page)).toBeDisabled();
  expect((await saved(page)).easy['2026-10-27'].hint).not.toBeNull();
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
  await press(page, extras[0]); // back to par
  await expect(bars(page)).toHaveCount(lv.par);
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
  await expect(dlg.getByRole('button', { name: 'Hard', pressed: true })).toBeVisible(); // opens on the mode on screen
  await expect(statsCell(page, 'Played')).toHaveText('1');
  await expect(statsCell(page, 'Win %')).toHaveText('100');
  await expect(statsCell(page, 'Average')).toHaveText('100');
  await expect(statsCell(page, 'Best')).toHaveText('100');
  await expect(statsCell(page, 'Streak')).toHaveText('1');
  await expect(statsCell(page, 'Best streak')).toHaveText('1');
  await dlg.getByRole('button', { name: 'Easy' }).click();
  await expect(dlg.getByRole('button', { name: 'Easy' })).toBeFocused();
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
  expect(s.hard['2026-10-27'].tries[0]).toMatchObject({ won: true, base: 100, fences: lv.answer.length });
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
  expect(s.lastMode).toBe('hard');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
  await expect(statsCell(page, 'Played')).toHaveText('2');
  await page.keyboard.press('Escape');
  await openDay(page, url('easy')); // Easy has nothing
  await expect(tryBtn(page)).toHaveText('Try');
  await expect(left(page)).toHaveCount(3);
});

test('a v1 player with no ?mode opens on Hard the first time', async ({ page }) => {
  await page.addInitScript(([k2, k1]) => {
    if (sessionStorage.getItem('migrated')) return;
    sessionStorage.setItem('migrated', '1');
    localStorage.removeItem(k2);
    localStorage.setItem(k1, JSON.stringify({ v: 1, seenHowTo: true, days: { '2026-10-27': { tries: 1, won: false, walls: [], hint: null, done: false } } }));
  }, [KEY, V1_KEY]);
  await openDay(page, '/daily/');
  await expect(page.locator('#tab-hard')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#board .cell')).toHaveCount(81);
});

test('if the v1 migration cannot fetch the Hard levels, it is skipped and Easy still loads', async ({ page }) => {
  await page.route('**/assets/levels/daily.json', (route) => route.abort());
  await page.addInitScript(([k2, k1]) => {
    localStorage.removeItem(k2);
    localStorage.setItem(k1, JSON.stringify({ v: 1, seenHowTo: true, days: { '2026-10-27': { tries: 1, won: false, walls: [], hint: null, done: false } } }));
  }, [KEY, V1_KEY]);
  await openDay(page, url('easy'));
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.getByText('did not load')).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k) !== null, V1_KEY)).toBe(true);
});

test('a skipped v1 migration still happens on a later visit, even after Easy was played and saved', async ({ page }) => {
  const lv = level('hard', 0);
  const v1 = { v: 1, seenHowTo: true, days: { '2026-10-27': { tries: 1, won: true, stars: 3, walls: lv.answer.map((w) => w.join(',')), hint: null, done: true, finishedOn: '2026-10-27' } } };
  await page.addInitScript(([k2, k1, old]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.removeItem(k2);
    localStorage.setItem(k1, JSON.stringify(old));
  }, [KEY, V1_KEY, v1]);
  // Visit 1: the Hard levels can't load, so migration is skipped; the player loses an Easy try (a v2 save now exists).
  await page.route('**/assets/levels/daily.json', (route) => route.abort());
  await openDay(page, url('easy'));
  await page.locator('#howto-close').click(); // seenHowTo lives in the v1 text, which wasn't carried yet
  await loseOnce(page, 'Try');
  const first = await saved(page);
  expect(first.v1Migrated).toBe(false);
  expect(first.hard).toEqual({});
  // Visit 2: the Hard levels load, and the old win is carried over.
  await page.unroute('**/assets/levels/daily.json');
  await openDay(page, url('hard'));
  const s = await saved(page);
  expect(s.v1Migrated).toBe(true);
  expect(s.hard['2026-10-27'].tries[0]).toMatchObject({ won: true, base: 100 });
  expect(s.easy['2026-10-27'].tries).toHaveLength(1); // the Easy try survives the merge
  await expect(score(page)).toHaveText('100 / 100');
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
  const hintLine = await hintBars(page).getAttribute('data-line');
  await page.locator('#clear').click();
  await placeAll(page, lv.answer.filter((w) => w.join(',') !== hintLine)); // the hint fence stays on the board
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

/* ---------- the optimal solution (v3) ---------- */

test.describe('the optimal solution toggle', () => {
  const solBtn = (page) => page.locator('#solution-btn');
  const rawSaved = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
  /** Win with one fence more than par (so the player's fences differ from the answer) and Submit. */
  async function submitOneOver(page, mode = 'easy', i = 0, path = url(mode)) {
    const lv = level(mode, i);
    const extra = extraFences(lv, 1);
    await openDay(page, path);
    await placeAll(page, [...lv.answer, ...extra]);
    await tryNow(page);
    await expect(result(page)).toHaveAttribute('data-state', 'review');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(result(page)).toHaveAttribute('data-state', 'done');
    return lv;
  }

  test('it is not on the page during play or on the Retry/Submit screen, and the page text has no par', async ({ page }) => {
    const lv = level('easy');
    await openDay(page);
    await expect(solBtn(page)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('optimal');
    await placeAll(page, [...lv.answer, ...extraFences(lv, 1)]);
    await tryNow(page);
    await expect(result(page)).toHaveAttribute('data-state', 'review');
    await expect(page.getByRole('button', { name: /Retry/ })).toBeVisible();
    await expect(solBtn(page)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('optimal');
    await expectNoPar(page);
  });

  test('after Submit it shows the answer in hint style with the par line; Hide puts the player\'s fences back; nothing saved changes; a reload shows the player\'s fences', async ({ page }) => {
    const lv = await submitOneOver(page);
    await expect(solBtn(page)).toHaveText('See the optimal solution');
    await expectNoPar(page); // the day is done, but the answer is not revealed until asked for
    const mine = await bars(page).count();
    expect(mine).toBe(lv.answer.length + 1);
    await expect(hintBars(page)).toHaveCount(0);
    const before = await rawSaved(page);
    const scoreBefore = await score(page).textContent();

    await solBtn(page).click();
    await expect(solBtn(page)).toHaveText('Hide the solution');
    await expect(solBtn(page)).not.toHaveAttribute('aria-pressed', /.*/); // the changing label alone announces the state
    await expect(page.locator('#board')).toBeInViewport(); // showing the solution scrolls the board into view
    await expect(page.locator('#solution-note')).toHaveText(`Par ${lv.par}: one way to fence him in with ${lv.par} fences.`);
    expect(lv.par).toBe(lv.answer.length);
    await expect(bars(page)).toHaveCount(lv.answer.length);
    await expect(hintBars(page)).toHaveCount(lv.answer.length);
    for (const w of lv.answer) await expect(page.locator(`#board .wall-bar[data-hint="1"][data-line="${w.join(',')}"]`)).toHaveCount(1);
    await expect(page.locator('#board .cell.reached')).toHaveCount(0); // fenced in: he does not reach the house
    if (process.env.SHOTS) { await page.setViewportSize({ width: 390, height: 844 }); await solBtn(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOTS}/solution.png`, fullPage: true }); }
    await expect(score(page)).toHaveText(scoreBefore);
    expect(await rawSaved(page)).toBe(before);

    await solBtn(page).click();
    await expect(solBtn(page)).toHaveText('See the optimal solution');
    await expect(page.locator('#solution-note')).toHaveText('');
    await expect(bars(page)).toHaveCount(mine);
    await expect(hintBars(page)).toHaveCount(0);
    expect(await rawSaved(page)).toBe(before);

    await solBtn(page).click(); // shown again, then a reload while it is showing
    await expect(hintBars(page)).toHaveCount(lv.answer.length);
    await page.reload();
    await expect(result(page)).toHaveAttribute('data-state', 'done');
    await expect(bars(page)).toHaveCount(mine);
    await expect(hintBars(page)).toHaveCount(0);
    await expect(solBtn(page)).toHaveText('See the optimal solution');
    await expect(page.locator('body')).not.toContainText('Par');
    expect(await rawSaved(page)).toBe(before);
  });

  test('after three losses it shows the answer and hides it again', async ({ page }) => {
    const lv = level('easy');
    await openDay(page);
    await loseOnce(page, 'Try');
    await loseOnce(page, 'Try again (2 left)');
    await expect(solBtn(page)).toHaveCount(0);
    await loseOnce(page, 'Try again (1 left)');
    await expect(result(page)).toHaveAttribute('data-result', 'lose');
    await expect(solBtn(page)).toBeVisible();
    await expect(bars(page)).toHaveCount(0);
    await expectNoPar(page);
    const before = await rawSaved(page);
    await solBtn(page).click();
    await expect(hintBars(page)).toHaveCount(lv.answer.length);
    await expect(page.locator('#solution-note')).toContainText(`Par ${lv.par}:`);
    expect(await rawSaved(page)).toBe(before);
    await solBtn(page).click();
    await expect(bars(page)).toHaveCount(0);
    expect(await rawSaved(page)).toBe(before);
    expect((await saved(page)).easy['2026-10-27'].walls).toEqual([]);
  });

  test('it works the same on a Hard archive day', async ({ page }) => {
    await setToday(page, '2026-10-30');
    const lv = await submitOneOver(page, 'hard', 1, url('hard', '2026-10-28'));
    await expect(page.locator('h1 .tag')).toHaveText('Archive');
    const mine = await bars(page).count();
    const before = await rawSaved(page);
    await solBtn(page).click();
    await expect(page.locator('#solution-note')).toHaveText(`Par ${lv.par}: one way to fence him in with ${lv.par} fences.`);
    await expect(hintBars(page)).toHaveCount(lv.answer.length);
    await solBtn(page).click();
    await expect(bars(page)).toHaveCount(mine);
    expect(await rawSaved(page)).toBe(before);
  });

  test('a hint used on the day stays the hint fence after Hide', async ({ page }) => {
    const lv = level('easy');
    await openDay(page);
    await placeAll(page, lv.answer.slice(0, 1));
    await hintBtn(page).click();
    const hintLine = await hintBars(page).getAttribute('data-line');
    await page.locator('#clear').click();
    await placeAll(page, lv.answer.filter((w) => w.join(',') !== hintLine));
    await tryNow(page);
    await page.getByRole('button', { name: 'Submit' }).click();
    await solBtn(page).click();
    await expect(hintBars(page)).toHaveCount(lv.answer.length);
    await solBtn(page).click();
    await expect(bars(page)).toHaveCount(lv.answer.length);
    await expect(hintBars(page)).toHaveCount(1);
  });
});

/* ---------- everyone's scores (v3) ---------- */

// The page only talks to a stats server when config.js STATS_URL is set. Tests turn it on with the localhost-only
// hook `?stats=<url>` (see assets/js/daily/everyone.js statsUrl) and point it at a same-origin path that page.route stubs.
test.describe('everyone\'s scores', () => {
  const STATS = '/__stats';
  const sUrl = (mode, date) => `${url(mode, date)}&stats=${STATS}`;
  const bandsOf = (counts) => ({ '100': counts[0], '80-99': counts[1], '60-79': counts[2], '30-59': counts[3], '1-29': counts[4], '0': counts[5] });
  /** A server reply of 14 players: 5 at 100, 3 at 88, 2 at 70, 2 at 40, 1 at 20, 1 at 0. */
  const BIG = { players: 14, bands: bandsOf([5, 3, 2, 2, 1, 1]), scores: { 100: 5, 88: 3, 70: 2, 40: 2, 20: 1, 0: 1 } };
  const SMALL = { players: 3, bands: bandsOf([1, 1, 0, 0, 0, 1]), scores: { 100: 1, 88: 1, 0: 1 } };

  /** Stub the stats server. `opts.postStatus` / `opts.statsStatus` can be changed while the page is up. */
  async function stubServer(page, reply = BIG) {
    const srv = { posts: [], gets: [], postStatus: 200, statsStatus: 200, reply };
    await page.route(`**${STATS}/**`, async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      if (req.method() === 'POST' && u.pathname === `${STATS}/result`) {
        srv.posts.push(JSON.parse(req.postData()));
        await route.fulfill({ status: srv.postStatus, contentType: 'application/json', body: JSON.stringify({ ok: srv.postStatus === 200, duplicate: false }) });
      } else if (req.method() === 'GET' && u.pathname === `${STATS}/stats`) {
        srv.gets.push(u.search);
        await route.fulfill({ status: srv.statsStatus, contentType: 'application/json', body: JSON.stringify(srv.reply) });
      } else {
        await route.fulfill({ status: 404, body: '' });
      }
    });
    return srv;
  }
  const noStatsTraffic = (page) => {
    const hits = [];
    page.on('request', (r) => { if (/\/(result|stats)(\?|$)/.test(new URL(r.url()).pathname)) hits.push(r.url()); });
    return hits;
  };
  const sameFences = (a, b) => expect([...a].map((w) => w.join(',')).sort()).toEqual([...b].map((w) => w.join(',')).sort());

  test('the real Worker handler accepts what the page posts, and its score is the score the page shows', async ({ page }) => {
    const db = fakeD1();
    const env = { DB: db, LEVELS: data };
    const NOW = NOON('2026-10-27').getTime();
    const seen = [];
    await page.route(`**${STATS}/**`, async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      const real = new Request(`https://stats.example${u.pathname.slice(STATS.length)}${u.search}`, {
        method: req.method(),
        headers: req.headers(),
        body: req.method() === 'POST' ? req.postData() : undefined,
      });
      const res = await handle(real, env, NOW);
      seen.push(`${req.method()} ${res.status}`);
      await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
    });
    await winDay(page, 'easy', 0, sUrl('easy'));
    await expect(page.locator('#everyone-count')).toBeVisible();
    expect(seen).toEqual(['POST 200', 'GET 200']);
    expect(db.results.size).toBe(1);
    const row = [...db.results.values()][0];
    expect(row).toMatchObject({ mode: 'easy', date: '2026-10-27', tries: 1, hint: 0 });
    await expect(score(page)).toHaveText(`${row.score} / 100`);
    await expect(page.locator('#everyone-count')).toHaveText('1 player today');
    expect((await saved(page)).easy['2026-10-27'].sent).toBe(true);
  });

  test('a finished day posts once with the right body, and a reload does not post again', async ({ page }) => {
    const srv = await stubServer(page);
    const lv = level('easy');
    await winDay(page, 'easy', 0, sUrl('easy'));
    await expect(page.locator('#everyone-count')).toBeVisible();
    expect(srv.posts).toHaveLength(1);
    const body = srv.posts[0];
    expect(Object.keys(body).sort()).toEqual(['date', 'device', 'fences', 'hint', 'mode', 'tries']);
    expect(body).toMatchObject({ mode: 'easy', date: '2026-10-27', hint: false, tries: 1 });
    expect(body.device).toMatch(/^[0-9a-f]{32}$/);
    sameFences(body.fences, lv.answer);
    const s1 = await saved(page);
    expect(s1.device).toBe(body.device);
    expect(s1.easy['2026-10-27'].sent).toBe(true);
    expect(srv.gets[0]).toBe('?mode=easy&date=2026-10-27');

    await page.reload();
    await expect(page.locator('#everyone-count')).toBeVisible();
    expect(srv.posts).toHaveLength(1);
    expect((await saved(page)).device).toBe(body.device);
  });

  test('the hint and the tries used are sent; a day with no win sends null fences', async ({ page }) => {
    const srv = await stubServer(page);
    const lv = level('easy');
    await openDay(page, sUrl('easy'));
    await placeAll(page, lv.answer.slice(0, 1));
    await hintBtn(page).click();
    const hintLine = await hintBars(page).getAttribute('data-line');
    await page.locator('#clear').click();
    await placeAll(page, lv.answer.filter((w) => w.join(',') !== hintLine));
    await tryNow(page);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('#everyone-count')).toBeVisible();
    expect(srv.posts[0]).toMatchObject({ hint: true, tries: 1, mode: 'easy' });
    sameFences(srv.posts[0].fences, lv.answer);

    await openDay(page, sUrl('hard'));
    await loseOnce(page, 'Try');
    await loseOnce(page, 'Try again (2 left)');
    await loseOnce(page, 'Try again (1 left)');
    await expect(page.locator('#everyone-count')).toBeVisible();
    expect(srv.posts).toHaveLength(2);
    expect(srv.posts[1]).toMatchObject({ mode: 'hard', date: '2026-10-27', fences: null, hint: false, tries: 3 });
    expect(srv.posts[1].device).toBe(srv.posts[0].device); // one id for the browser
  });

  test('a failed post leaves the day unsent and retries on the next load, then stops', async ({ page }) => {
    const srv = await stubServer(page);
    srv.postStatus = 503;
    await winDay(page, 'easy', 0, sUrl('easy'));
    await expect(page.locator('#everyone-count')).toBeVisible(); // the spread still shows
    expect(srv.posts).toHaveLength(1);
    expect((await saved(page)).easy['2026-10-27'].sent).toBe(false);

    srv.postStatus = 200;
    await page.reload();
    await expect(page.locator('#everyone-count')).toBeVisible();
    expect(srv.posts).toHaveLength(2);
    expect(srv.posts[1]).toEqual(srv.posts[0]);
    expect((await saved(page)).easy['2026-10-27'].sent).toBe(true);

    await page.reload();
    await expect(page.locator('#everyone-count')).toBeVisible();
    expect(srv.posts).toHaveLength(2);
  });

  test('the spread shows six bars, the player\'s band highlighted, the player count, and "You beat X%"', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubShare(page, 'share');
    const srv = await stubServer(page);
    await winDay(page, 'easy', 0, sUrl('easy'));
    const box = page.locator('#everyone');
    await expect(box.locator('.dist li')).toHaveCount(6);
    await expect(box.locator('.dist li span:first-child')).toHaveText(['100', '80 to 99', '60 to 79', '30 to 59', '1 to 29', '0']);
    await expect(box.locator('.dist li .bar')).toHaveText(['5', '3', '2', '2', '1', '1']);
    await expect(box.locator('.dist li.mine')).toHaveCount(1);
    await expect(box.locator('.dist li.mine')).toHaveAttribute('data-band', '100');
    await expect(page.locator('#everyone-count')).toHaveText('14 players today');
    // 100 beats 9 of the 13 other players (the player is one of the 14 and was sent)
    const x = Math.floor((9 * 100) / 13);
    expect(x).toBe(69);
    await expect(page.locator('#everyone-beat')).toHaveText(`You beat ${x}% of players`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await box.scrollIntoViewIfNeeded();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/stats-block.png` });

    await page.getByRole('button', { name: 'Share' }).click();
    const shared = await page.evaluate(() => window.__shared);
    expect(shared[0].text).toBe(['Gnome Sweet Gnome #1 Easy 🍄', '100/100', '🟩', `Beat ${x}% of players`, shareUrl(page, 'easy')].join('\n'));
    expect(srv.posts).toHaveLength(1);
  });

  test('fewer than 10 players: no percentage, the "Only N players" line, and no Beat line in the share text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubShare(page, 'share');
    await stubServer(page, SMALL);
    await winDay(page, 'easy', 0, sUrl('easy'));
    await expect(page.locator('#everyone-count')).toHaveText('3 players today');
    await expect(page.locator('#everyone-beat')).toHaveText('Only 3 players so far. Check back later.');
    await expect(page.locator('#everyone')).not.toContainText('You beat');
    await page.locator('#everyone').scrollIntoViewIfNeeded();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/stats-few.png` });
    await page.getByRole('button', { name: 'Share' }).click();
    const shared = await page.evaluate(() => window.__shared);
    expect(shared[0].text).toBe(['Gnome Sweet Gnome #1 Easy 🍄', '100/100', '🟩', shareUrl(page, 'easy')].join('\n'));
  });

  test('a day with no win highlights the 0 band', async ({ page }) => {
    await stubServer(page);
    await openDay(page, sUrl('easy'));
    await loseOnce(page, 'Try');
    await loseOnce(page, 'Try again (2 left)');
    await loseOnce(page, 'Try again (1 left)');
    await expect(page.locator('#everyone .dist li.mine')).toHaveAttribute('data-band', '0');
    await expect(page.locator('#everyone-beat')).toHaveText('You beat 0% of players');
  });

  test('archive days show the archive message and send and fetch nothing', async ({ page }) => {
    await setToday(page, '2026-10-30');
    const srv = await stubServer(page);
    await winDay(page, 'easy', 1, sUrl('easy', '2026-10-28'));
    await expect(page.locator('#everyone')).toHaveText("Player stats are kept for each day's own date only.");
    await page.reload();
    await expect(page.locator('#everyone')).toContainText('kept for each day');
    expect(srv.posts).toHaveLength(0);
    expect(srv.gets).toHaveLength(0);
    expect((await saved(page)).easy['2026-10-28'].sent).toBe(false);
  });

  test('with STATS_URL null (no hook) nothing is sent, fetched or shown', async ({ page }) => {
    const hits = noStatsTraffic(page);
    await winDay(page, 'easy', 0, url('easy'));
    await page.reload();
    await expect(result(page)).toHaveAttribute('data-state', 'done');
    await expect(page.locator('#everyone')).toHaveCount(0);
    await expect(result(page)).not.toContainText('players');
    expect(hits).toEqual([]);
    const s = await saved(page);
    expect(s.easy['2026-10-27'].sent).toBe(false);
    expect(s.device ?? null).toBeNull(); // not even an id is made
  });

  test('if the stats cannot load, the break line shows and the rest of the page works', async ({ page }) => {
    await stubShare(page, 'share');
    const srv = await stubServer(page);
    srv.statsStatus = 500;
    await winDay(page, 'easy', 0, sUrl('easy'));
    await expect(page.locator('#everyone')).toHaveText('Player stats are taking a break.');
    await expect(page.getByRole('button', { name: 'Share' })).toBeEnabled();
    await expect(score(page)).toHaveText('100 / 100');
    await page.getByRole('button', { name: 'Share' }).click();
    expect((await page.evaluate(() => window.__shared))[0].text).not.toContain('Beat');
    await expect(page.locator('#solution-btn')).toBeVisible();
  });

  test('a stats reply of the wrong shape is treated as a break', async ({ page }) => {
    const srv = await stubServer(page, { players: 'lots' });
    await winDay(page, 'easy', 0, sUrl('easy'));
    await expect(page.locator('#everyone')).toHaveText('Player stats are taking a break.');
    expect(srv.posts).toHaveLength(1);
  });
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

  test('catching up a missed day in the archive does not repair the streak', async ({ context }) => {
    const day28 = await pageAt(context, '2026-10-28');
    await winDay(day28, 'hard', 1, url('hard')); // #2, won on the day
    await day28.close();
    const day30 = await pageAt(context, '2026-10-30'); // 29 Oct missed
    await winDay(day30, 'hard', 2, url('hard', '2026-10-29'));
    await winDay(day30, 'hard', 3, url('hard'));
    await day30.getByRole('button', { name: 'Stats', exact: true }).first().click();
    await expect(statsCell(day30, 'Played')).toHaveText('3');
    await expect(statsCell(day30, 'Streak')).toHaveText('1');
    await expect(statsCell(day30, 'Best streak')).toHaveText('1');
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
