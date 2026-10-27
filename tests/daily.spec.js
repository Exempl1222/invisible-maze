// The standalone daily page (daily/index.html, docs/DAILY_SPEC.md). Answers come from daily.json and are
// pressed into the real page. The gnome's walk is skipped (reduced motion) so tests stay fast; the
// animation itself is covered by play.spec.js.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const dailyData = readJson('../assets/levels/daily.json');
const day1 = dailyData.levels[0]; // 27 Oct 2026, #1
const day2 = dailyData.levels[1];
const KEY = 'gnome-sweet-gnome:daily:v1';
const URL1 = '/daily/?date=2026-10-27';
const URL1_PLAIN = '/daily/';
const NOON = (date) => new Date(`${date}T12:00:00+11:00`);

test.use({ reducedMotion: 'reduce', timezoneId: 'Australia/Sydney' });

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const bars = (page) => page.locator('#board .wall-bar');
const hintBars = (page) => page.locator('#board .wall-bar[data-hint="1"]');
const go = (page) => page.locator('#go');
const result = (page) => page.locator('#result');
const hintBtn = (page) => page.locator('#hint-btn');
const left = (page) => page.locator('#pips i.left'); // filled pips: tries left
const won = (page) => page.locator('#pips i.won');

async function press(page, [x, y, dir]) {
  await tile(page, x, y).scrollIntoViewIfNeeded(); // mouse clicks miss a tile that is off screen
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
    await expect(bars(page)).toHaveCount(before + 1);
    await expect(page.locator(`#board .wall-bar[data-line="${w.join(',')}"]`), `fence ${w.join(',')} landed on its own line`).toHaveCount(1);
  }
}

/** Skip the first-visit card (unless the key is already there), so tests that are not about it start clean. */
const seedStorage = (page) => page.addInitScript((key) => {
  try {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 1, seenHowTo: true, days: {} }));
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

async function openDay(page, url = URL1) {
  await page.goto(url);
  await expect(page.locator('#board .cell').first()).toBeVisible();
}
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);

/** Press Go expecting a win; on failure, say what the page says (for CI-only failures). */
async function winNow(page) {
  await go(page).click();
  // Playwright 1.56 (CI) can stall the page's faked timers after setSystemTime plus a new page load,
  // so the walk's last step never fires. Advancing the fake clock flushes them; harmless elsewhere.
  await page.clock.runFor(1000);
  await expect(page.locator('#board[aria-busy="false"], #result:not([hidden])').first()).toBeAttached();
  const info = await page.evaluate(() => ({
    status: document.getElementById('status')?.textContent,
    go: document.getElementById('go')?.textContent,
    h1: document.querySelector('h1')?.textContent,
    now: new Date().toString(),
    fences: [...document.querySelectorAll('#board .wall-bar')].map((b) => b.dataset.line).join(' '),
    newDay: !document.getElementById('new-day')?.hidden,
  }));
  await expect(result(page), JSON.stringify(info)).toHaveAttribute('data-result', 'win');
}

/** Press Go with whatever is on the board and wait for the try to settle. */
async function loseOnce(page, expectedLabel) {
  await expect(go(page)).toHaveText(expectedLabel);
  await go(page).click();
  // The label changes as the walk starts, so also wait for the walk to end (the board unlocks,
  // or the day finishes) before touching the board again. Slow CI machines need this.
  await expect(page.locator('#board[aria-busy="false"], #result:not([hidden])').first()).toBeAttached();
}

test('loads #1 for 2026-10-27 with the date line and the level limits', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDay(page);
  await expect(page.locator('h1')).toHaveText('Daily #1');
  await expect(page.locator('#date-line')).toHaveText('Tue 27 Oct');
  await expect(page).toHaveTitle(/Daily #1/);
  await expect(page.locator('#board .cell')).toHaveCount(81);
  await expect(page.locator('#par')).toHaveText(String(day1.par));
  await expect(page.locator('#move-limit')).toHaveText(String(day1.moveLimit));
  await expect(page.locator('#walls-used')).toHaveText(`0 / ${day1.wallBudget}`);
  await expect(go(page)).toHaveText('Go');
  await expect(hintBtn(page)).toHaveText('Hint (1)');
  await expect(page.locator('#pips')).toHaveAttribute('aria-label', '3 tries left');
  await expect(page.locator('.tries-label')).toHaveText('Tries left');
  await expect(left(page)).toHaveCount(3);
  await expect(page.locator('footer')).toHaveText('A new gnome every day.');
  await setToday(page, '2026-10-28');
  await openDay(page, URL1_PLAIN);
  await expect(page.locator('h1')).toHaveText('Daily #2');
  await expect(page.locator('#date-line')).toHaveText('Wed 28 Oct');
  expect(errors).toEqual([]);
});

test('page meta for link previews', async ({ page }) => {
  await openDay(page);
  const meta = (sel) => page.locator(sel).getAttribute('content');
  expect(await meta('meta[property="og:title"]')).toBe('Gnome Sweet Gnome: daily puzzle');
  expect(await meta('meta[property="og:description"]')).toBe('Fence in the runaway gnome. One new puzzle a day.');
  expect(await meta('meta[property="og:url"]')).toBe('https://exempl1222.github.io/invisible-maze/daily/');
  expect(await meta('meta[name="twitter:card"]')).toBe('summary');
});

test('first visit shows how to play once, and the ? button reopens it', async ({ page }) => {
  // This test wants the first-visit state, so it clears what beforeEach seeded, once.
  await page.addInitScript(() => { if (!sessionStorage.getItem('cleared')) { sessionStorage.setItem('cleared', '1'); localStorage.clear(); } });
  await page.goto(URL1);
  const dlg = page.locator('#howto-dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await expect(dlg.locator('li')).toHaveCount(3);
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

test('win with the par answer on try 1, then a reload shows the locked finished state', async ({ page }) => {
  await openDay(page);
  await placeAll(page, day1.answer);
  await expect(page.locator('#walls-used')).toHaveText(`${day1.answer.length} / ${day1.wallBudget}`);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(result(page).getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
  await expect(page.locator('#try-line')).toHaveText('Won on try 1 of 3');
  await expect(result(page)).toContainText(`Par ${day1.par}`);
  await expect(result(page)).toContainText(`You used ${day1.answer.length} fences`);
  await expect(page.locator('#controls')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share' })).toBeFocused();
  await expect(left(page)).toHaveCount(0);
  await expect(won(page)).toHaveCount(1);
  await expect(page.locator('#pips')).toHaveAttribute('aria-label', 'Won on try 1');
  // One announcement on #status; the result panel itself is not a live region.
  await expect(page.locator('#status')).toHaveText('Fenced in on try 1, 3 stars.');
  await expect(result(page)).not.toHaveAttribute('role', 'status');

  await page.reload();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(page.locator('#try-line')).toHaveText('Won on try 1 of 3');
  await expect(page.locator('#controls')).toBeHidden();
  await expect(bars(page)).toHaveCount(day1.answer.length);
  await expect(page.locator('#walls-used')).toHaveText(`${day1.answer.length} / ${day1.wallBudget}`);
  // Locked: pressing the board changes nothing.
  await press(page, [0, 0, 'R']);
  await expect(bars(page)).toHaveCount(day1.answer.length);
  expect((await saved(page)).days['2026-10-27']).toMatchObject({ tries: 1, won: true, stars: 3, done: true, finishedOn: '2026-10-27' });
});

test('three losses end the day, reveal the answer as a hint, and a reload does not give tries back', async ({ page }) => {
  await openDay(page);
  await loseOnce(page, 'Go');
  await expect(go(page)).toHaveText('Try again (2 left)');
  await expect(left(page)).toHaveCount(2);
  await expect(result(page)).toBeHidden();
  await loseOnce(page, 'Try again (2 left)');
  await expect(go(page)).toHaveText('Try again (1 left)');
  await loseOnce(page, 'Try again (1 left)');

  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(result(page).getByRole('heading', { name: 'He made it home' })).toBeVisible();
  await expect(page.locator('#try-line')).toContainText('Lost');
  await expect(page.locator('#answer-note')).toHaveText(`One way to fence him in (par ${day1.par}).`);
  await expect(page.locator('#status')).toHaveText('He made it home. Out of tries.');
  await expect(page.locator('#walls-label')).toHaveText('Answer');
  await expect(page.locator('#walls-used')).toHaveText(`${day1.answer.length} / ${day1.wallBudget}`);
  await expect(page.getByRole('button', { name: 'Share' })).toBeFocused();
  await expect(hintBars(page)).toHaveCount(day1.answer.length);
  await expect(bars(page)).toHaveCount(day1.answer.length);
  await expect(page.locator('#controls')).toBeHidden();

  await page.reload();
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#controls')).toBeHidden();
  await expect(hintBars(page)).toHaveCount(day1.answer.length);
  await expect(left(page)).toHaveCount(0);
  await expect(page.locator('#pips')).toHaveAttribute('aria-label', 'No tries left');
  await expect(page.locator('#answer-note')).toHaveText(`One way to fence him in (par ${day1.par}).`);
  await expect(page.locator('#walls-label')).toHaveText('Answer');
  expect((await saved(page)).days['2026-10-27']).toMatchObject({ tries: 3, won: false, done: true, finishedOn: '2026-10-27' });
});

test('a reload mid-day keeps tries used, the walls and the hint', async ({ page }) => {
  await openDay(page);
  await loseOnce(page, 'Go'); // try 1 spent
  await expect(go(page)).toHaveText('Try again (2 left)');
  await hintBtn(page).click();
  await expect(hintBars(page)).toHaveCount(1);
  const hintLine = await hintBars(page).getAttribute('data-line');
  const other = day1.answer.find((w) => w.join(',') !== hintLine);
  await press(page, other);
  await expect(bars(page)).toHaveCount(2);

  await page.reload();
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await expect(go(page)).toHaveText('Try again (2 left)');
  await expect(left(page)).toHaveCount(2);
  await expect(bars(page)).toHaveCount(2);
  await expect(hintBars(page)).toHaveCount(1);
  await expect(hintBars(page)).toHaveAttribute('data-line', hintLine);
  await expect(hintBtn(page)).toHaveText('Hint used');
  await expect(hintBtn(page)).toBeDisabled();
  await expect(result(page)).toBeHidden();
});

test('reloading right after pressing Go cannot give the try back', async ({ page }) => {
  await openDay(page);
  await go(page).click();
  await page.reload();
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await expect(go(page)).toHaveText('Try again (2 left)');
  await expect(left(page)).toHaveCount(2);
});

test.describe('with the walk animation on', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('a reload in the middle of the gnome\'s walk cannot give the try back', async ({ page }) => {
    await openDay(page);
    await go(page).click();
    await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'true'); // the board is locked: the walk is on
    await expect(go(page)).toBeDisabled();
    await page.reload();
    await expect(page.locator('#board .cell').first()).toBeVisible();
    await expect(go(page)).toHaveText('Try again (2 left)');
    await expect(left(page)).toHaveCount(2);
    expect((await saved(page)).days['2026-10-27']).toMatchObject({ tries: 1, done: false });
  });
});

test('the hint can be used once, then it is disabled, and it costs a star', async ({ page }) => {
  await openDay(page);
  await hintBtn(page).click();
  await expect(hintBars(page)).toHaveCount(1);
  await expect(hintBtn(page)).toHaveText('Hint used');
  await expect(hintBtn(page)).toBeDisabled();
  // A hint wall stays: tapping it again does not remove it.
  const hintLine = await hintBars(page).getAttribute('data-line');
  const [hx, hy, hd] = hintLine.split(',');
  await press(page, [Number(hx), Number(hy), hd]);
  await expect(hintBars(page)).toHaveCount(1);
  // Clear walls keeps it.
  await press(page, [0, 0, 'R']);
  await page.locator('#clear').click();
  await expect(hintBars(page)).toHaveCount(1);
  await expect(bars(page)).toHaveCount(1);
  // Finish with par fences in total: 3 stars minus 1 for the hint.
  await placeAll(page, day1.answer.filter((w) => w.join(',') !== hintLine));
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(result(page).getByRole('img', { name: '2 of 3 stars' })).toBeVisible();
  await expect(page.locator('#hint-used')).toHaveText('Hint used, −1 star.');
});

const stubShare = (page, mode) => page.addInitScript((m) => {
  window.__shared = [];
  window.__copied = [];
  const nav = (name, value) => Object.defineProperty(navigator, name, { value, configurable: true });
  nav('share', m === 'share' ? async (d) => { window.__shared.push(d); }
    : m === 'abort' ? async () => { throw new DOMException('closed', 'AbortError'); } : undefined);
  nav('clipboard', m === 'fail' ? { writeText: async () => { throw new Error('no'); } } : { writeText: async (t) => { window.__copied.push(t); } });
}, mode);
const pageUrl = (page) => new URL('/daily/', page.url()).toString();

test('share text for a win matches the spec format (navigator.share)', async ({ page }) => {
  await stubShare(page, 'share');
  await openDay(page);
  await loseOnce(page, 'Go');
  await expect(go(page)).toHaveText('Try again (2 left)');
  await placeAll(page, day1.answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await page.getByRole('button', { name: 'Share' }).click();
  const shared = await page.evaluate(() => window.__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0].text).toBe([
    'Gnome Sweet Gnome #1 🍄',
    `⭐⭐⭐ ${day1.answer.length} fences (par ${day1.par})`,
    '🟥🟩 2/3',
    pageUrl(page),
  ].join('\n'));
  expect(shared[0].text).not.toContain('?');
});

test('share text for a loss, with a hint, is copied when navigator.share is missing', async ({ page }) => {
  await stubShare(page, 'clipboard');
  await openDay(page);
  await hintBtn(page).click();
  await loseOnce(page, 'Go');
  await loseOnce(page, 'Try again (2 left)');
  await loseOnce(page, 'Try again (1 left)');
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.locator('#share-note')).toHaveText('Copied');
  const copied = await page.evaluate(() => window.__copied);
  expect(copied).toEqual([['Gnome Sweet Gnome #1 🍄', '🏠 He made it home 💡', '🟥🟥🟥 X/3', pageUrl(page)].join('\n')]);
});

test('if sharing and copying both fail, the text is shown in a selectable box', async ({ page }) => {
  await stubShare(page, 'fail');
  await openDay(page);
  await placeAll(page, day1.answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await page.getByRole('button', { name: 'Share' }).click();
  const box = page.locator('#share-box');
  await expect(box).toBeVisible();
  await expect(box).toHaveValue(/^Gnome Sweet Gnome #1 🍄\n⭐⭐⭐ 4 fences \(par 4\)\n🟩 1\/3\nhttp/);
});

test('stats and streak after winning two consecutive dates', async ({ page }) => {
  await openDay(page, URL1);
  await placeAll(page, day1.answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await setToday(page, '2026-10-28');
  await openDay(page, URL1_PLAIN);
  await placeAll(page, day2.answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');

  await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
  const dlg = page.locator('#stats-dlg');
  await expect(dlg).toBeVisible();
  const cell = (label) => dlg.locator('.stats-grid div').filter({ hasText: label }).locator('dd');
  await expect(cell('Played')).toHaveText('2');
  await expect(cell('Win %')).toHaveText('100');
  await expect(cell('Streak')).toHaveText('2');
  await expect(cell('Best')).toHaveText('2');
  await expect(dlg.locator('.dist li')).toHaveCount(4);
  await expect(dlg.locator('.dist li.today')).toHaveCount(1);
  await expect(dlg.locator('.dist li').first()).toContainText('3 stars');
  await expect(dlg.locator('.dist li.today')).toContainText('3 stars');
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(dlg).toBeHidden();

  // A day later with no play yet: the streak still stands through yesterday.
  await setToday(page, '2026-10-29');
  await openDay(page, URL1_PLAIN);
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(cell('Streak')).toHaveText('2');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  // A missed day ends it.
  await setToday(page, '2026-10-31');
  await openDay(page, URL1_PLAIN);
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(cell('Streak')).toHaveText('0');
  await expect(cell('Best')).toHaveText('2');
});

test('the countdown shows after the day is done, then offers a new gnome at midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T18:48:00+11:00') });
  await page.goto(URL1);
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await expect(page.locator('#countdown')).toHaveCount(0);
  await placeAll(page, day1.answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
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
});

test('the countdown catches up when the tab becomes visible again', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-27T18:48:00+11:00'));
  await openDay(page);
  await placeAll(page, day1.answer);
  await go(page).click();
  await expect(page.locator('#countdown')).toHaveText('Next gnome in 5h 12m');
  await page.clock.pauseAt(new Date('2026-10-27T20:00:00+11:00')); // time jumps with no timer firing, like a sleeping tab
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#countdown')).toHaveText('Next gnome in 4h 0m');
});

test('the break message shows for a day before the batch, with a way back to today but none to the game', async ({ page }) => {
  await page.goto('/daily/?date=2026-10-26'); // in the archive window, but there is no puzzle
  await expect(page.getByText('The daily is taking a break.')).toBeVisible();
  await expect(page.locator('#game-view')).toBeHidden();
  await expect(page.locator('a')).toHaveCount(0);
});

test('a future date is not ready, with a button to today', async ({ page }) => {
  await page.goto('/daily/?date=2099-12-31');
  await expect(page.getByText('Not ready yet. This gnome is still packing.')).toBeVisible();
  await expect(page.locator('#game-view')).toBeHidden();
  await expect(page.locator('#tries')).toBeHidden();
  await expect(page.locator('a')).toHaveCount(0);
  await page.locator('#break-today').click();
  await expect(page).toHaveURL(/\/daily\/$/);
  await expect(page.locator('h1')).toHaveText('Daily #1');
});

for (const date of ['2026-09-27', '2020-01-01', 'not-a-date', '2026-02-30', '']) {
  test(`?date=${date || '(empty)'} is out of the archive, with a button to today`, async ({ page }) => {
    await page.goto(`/daily/?date=${date}`);
    await expect(page.getByText('That day is out of the archive.')).toBeVisible();
    await expect(page.locator('#game-view')).toBeHidden();
    await expect(page.locator('a')).toHaveCount(0);
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
  await expect(page.locator('a')).toHaveCount(0);
  await expect(page.locator('#wordmark')).not.toHaveJSProperty('tagName', 'A');
  await placeAll(page, day1.answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(page.locator('a')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Want more');
});

test('corrupt saved data is ignored and the page still works', async ({ page }) => {
  await page.addInitScript((k) => { localStorage.setItem(k, '{broken json'); }, KEY);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDay(page);
  await expect(go(page)).toHaveText('Go');
  await expect(page.locator('#howto-dlg')).toBeVisible(); // nothing saved, so it counts as a first visit
  expect(errors).toEqual([]);
});

test('no horizontal scroll at 390px, and every control is at least 44px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDay(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const b of await page.locator('button:visible:not(.cell)').all()) {
    const box = await b.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await placeAll(page, day1.answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const b of await result(page).locator('button:visible').all()) {
    const box = await b.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'How to play' }).click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  const dlgBox = await page.locator('#howto-dlg').boundingBox();
  expect(dlgBox.x).toBeGreaterThanOrEqual(16 - 1);
  expect(dlgBox.x + dlgBox.width).toBeLessThanOrEqual(390 - 16 + 1);
});

test('closing the share sheet (AbortError) shows no note, no box, and does not touch the clipboard', async ({ page }) => {
  await stubShare(page, 'abort');
  await page.addInitScript(() => {
    const clip = navigator.clipboard;
    navigator.clipboard.writeText = async (t) => { window.__copied.push(t); return clip; };
  });
  await openDay(page);
  await placeAll(page, day1.answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await page.getByRole('button', { name: 'Share' }).click();
  await page.waitForTimeout(150);
  await expect(page.locator('#share-note')).toHaveText('');
  await expect(page.locator('#share-box')).toBeHidden();
  expect(await page.evaluate(() => window.__copied)).toEqual([]);
});

/* ---------- the archive ---------- */

test.describe('the archive', () => {
  // Today is Fri 30 Oct, #4. The days before it back to the batch start (27 Oct) are the archive.
  test.beforeEach(async ({ page }) => { await setToday(page, '2026-10-30'); });
  const ARCHIVE_URL = '/daily/?date=2026-10-28'; // #2

  test('the dialog lists today first, marked, with each day\'s number, date and result', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDay(page, URL1_PLAIN);
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
    await expect(rows.nth(1)).toContainText('Not played');
    for (const r of await rows.all()) expect((await r.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const box = await dlg.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(15);
    expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('button', { name: 'Archive' })).toBeFocused();
  });

  test('tapping a past day goes there: Archive tag, a way back to today', async ({ page }) => {
    await openDay(page, URL1_PLAIN);
    await page.getByRole('button', { name: 'Archive' }).click();
    await page.locator('#archive-dlg .arch-row[data-date="2026-10-28"]').click();
    await expect(page).toHaveURL(/date=2026-10-28$/);
    await expect(page.locator('h1')).toContainText('Daily #2');
    await expect(page.locator('h1 .tag')).toHaveText('Archive');
    await expect(page.locator('#date-line')).toHaveText('Wed 28 Oct');
    await expect(page.locator('#board .cell').first()).toBeVisible();
    await expect(page.locator('#par')).toHaveText(String(day2.par));
    await page.getByRole('button', { name: "Today's gnome" }).click();
    await expect(page.locator('h1')).toHaveText('Daily #4');
  });

  test('a past day plays for real and is saved; it counts as played but not toward the streak; the share says (archive)', async ({ page }) => {
    await stubShare(page, 'share');
    await openDay(page, ARCHIVE_URL);
    await placeAll(page, day2.answer);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win');
    await expect(page.locator('#try-line')).toHaveText('Won on try 1 of 3');
    expect((await saved(page)).days['2026-10-28']).toMatchObject({ tries: 1, won: true, stars: 3, done: true, finishedOn: '2026-10-30' });

    await page.reload(); // locked and finished on reload, like today
    await expect(result(page)).toHaveAttribute('data-result', 'win');
    await expect(page.locator('#controls')).toBeHidden();

    await page.getByRole('button', { name: 'Share' }).click();
    const shared = await page.evaluate(() => window.__shared);
    expect(shared[0].text.split('\n')[0]).toBe('Gnome Sweet Gnome #2 (archive) 🍄');
    expect(shared[0].text).not.toContain('?');

    await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
    const dlg = page.locator('#stats-dlg');
    const cell = (label) => dlg.locator('.stats-grid div').filter({ hasText: label }).locator('dd');
    await expect(cell('Played')).toHaveText('1');
    await expect(cell('Win %')).toHaveText('100');
    await expect(cell('Streak')).toHaveText('0');
    await expect(cell('Best')).toHaveText('0');
    await expect(dlg.locator('.dist li').first()).toContainText('3 stars');
    await expect(dlg.locator('.dist li').first().locator('.bar')).toHaveText('1');
    await expect(dlg.locator('.dist li.today')).toHaveCount(0); // today itself is not done
    await page.keyboard.press('Escape');

    // The archive row shows the result, and a win on the day itself starts a streak of 1.
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.locator('#archive-dlg .arch-row[data-date="2026-10-28"]').getByRole('img', { name: '3 stars' })).toBeVisible();
    await page.keyboard.press('Escape');
    await openDay(page, URL1_PLAIN);
    await expect(page.locator('h1')).toContainText('Daily #4');
    await placeAll(page, dailyData.levels[3].answer);
    await winNow(page);
    await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
    await expect(cell('Played')).toHaveText('2');
    await expect(cell('Streak')).toHaveText('1');
    await expect(cell('Best')).toHaveText('1');
  });

  test('catching up a missed day in the archive does not repair the streak', async ({ page }) => {
    await setToday(page, '2026-10-28');
    await openDay(page, URL1_PLAIN); // #2, won on the day
    await placeAll(page, day2.answer);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win');
    await setToday(page, '2026-10-30'); // 29 Oct missed
    await openDay(page, '/daily/?date=2026-10-29');
    await expect(page.locator('h1')).toContainText('Daily #3');
    await placeAll(page, dailyData.levels[2].answer);
    await winNow(page);
    await openDay(page, URL1_PLAIN);
    await expect(page.locator('h1')).toContainText('Daily #4');
    await placeAll(page, dailyData.levels[3].answer);
    await winNow(page);
    await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
    const cell = (label) => page.locator('#stats-dlg .stats-grid div').filter({ hasText: label }).locator('dd');
    await expect(cell('Played')).toHaveText('3');
    await expect(cell('Streak')).toHaveText('1');
    await expect(cell('Best')).toHaveText('1');
  });

  test('a lost archive day shows Lost in the list; a day in progress says so', async ({ page }) => {
    await openDay(page, ARCHIVE_URL);
    await loseOnce(page, 'Go');
    await openDay(page, '/daily/?date=2026-10-29');
    await loseOnce(page, 'Go');
    await loseOnce(page, 'Try again (2 left)');
    await loseOnce(page, 'Try again (1 left)');
    await expect(result(page)).toHaveAttribute('data-result', 'lose');
    await page.getByRole('button', { name: 'Archive' }).click();
    const row = (d) => page.locator(`#archive-dlg .arch-row[data-date="${d}"]`);
    await expect(row('2026-10-28')).toContainText('In progress');
    await expect(row('2026-10-29')).toContainText('Lost');
  });
});

/* ---------- two tabs ---------- */

test('two tabs: tries spent in one are not lost when the other presses Go, and the first catches up', async ({ page, context }) => {
  await openDay(page); // tab A
  const b = await context.newPage();
  await seedStorage(b);
  // Tab B ignores the storage event, so it is stale and has to re-read before it writes.
  await b.addInitScript(() => window.addEventListener('storage', (e) => e.stopImmediatePropagation(), true));
  await b.clock.install({ time: NOON('2026-10-27') });
  await openDay(b);

  await loseOnce(page, 'Go');
  await expect(go(page)).toHaveText('Try again (2 left)');
  await loseOnce(page, 'Try again (2 left)');
  await expect(go(page)).toHaveText('Try again (1 left)');
  expect((await saved(page)).days['2026-10-27'].tries).toBe(2);

  await expect(go(b)).toHaveText('Go'); // B still thinks nothing was spent
  await go(b).click();
  await expect(result(b)).toHaveAttribute('data-result', 'lose'); // B's press landed on top of A's two tries
  expect((await saved(page)).days['2026-10-27']).toMatchObject({ tries: 3, done: true, won: false });

  // A hears about it through the storage event and shows the finished day.
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#controls')).toBeHidden();
  await expect(left(page)).toHaveCount(0);
  await b.close();
});

test('two tabs: a win in one locks the other, and a stale tab cannot play a finished day', async ({ page, context }) => {
  await openDay(page);
  const b = await context.newPage();
  await seedStorage(b);
  await b.addInitScript(() => window.addEventListener('storage', (e) => e.stopImmediatePropagation(), true));
  await b.clock.install({ time: NOON('2026-10-27') });
  await openDay(b);
  await placeAll(page, day1.answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await go(b).click(); // stale B presses Go on a day A already won
  await expect(result(b)).toHaveAttribute('data-result', 'win');
  await expect(b.locator('#try-line')).toHaveText('Won on try 1 of 3');
  expect((await saved(page)).days['2026-10-27']).toMatchObject({ tries: 1, won: true, stars: 3 });
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
    await page.goto(URL1);
    await expect(page.locator('#board .cell').first()).toBeVisible();
    await page.locator('#howto-close').click(); // nothing can be remembered, so it is a first visit
    await loseOnce(page, 'Go');
    await expect(go(page)).toHaveText('Try again (2 left)'); // memory still counts the try
    await placeAll(page, day1.answer);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win');
    await expect(page.locator('#try-line')).toHaveText('Won on try 2 of 3');
    await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
    await expect(page.locator('#stats-dlg')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
