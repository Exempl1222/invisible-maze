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
const URL2 = '/daily/?date=2026-10-28';

test.use({ reducedMotion: 'reduce', timezoneId: 'Australia/Sydney' });

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const bars = (page) => page.locator('#board .wall-bar');
const hintBars = (page) => page.locator('#board .wall-bar[data-hint="1"]');
const go = (page) => page.locator('#go');
const result = (page) => page.locator('#result');
const hintBtn = (page) => page.locator('#hint-btn');
const spent = (page) => page.locator('#pips i.spent');

async function press(page, [x, y, dir]) {
  const box = await tile(page, x, y).boundingBox();
  const f = { R: [0.88, 0.5], D: [0.5, 0.88], L: [0.12, 0.5], U: [0.5, 0.12] }[dir];
  await page.mouse.move(box.x + box.width * f[0], box.y + box.height * f[1]);
  await page.mouse.down();
  await page.mouse.up();
}
const placeAll = async (page, list) => { for (const w of list) await press(page, w); };

/** Skip the first-visit card (unless the key is already there), so tests that are not about it start clean. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    try {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 1, seenHowTo: true, days: {} }));
    } catch { /* storage blocked */ }
  }, KEY);
});

async function openDay(page, url = URL1) {
  await page.goto(url);
  await expect(page.locator('#board .cell').first()).toBeVisible();
}
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);

/** Press Go with whatever is on the board and wait for the try to settle. */
async function loseOnce(page, expectedLabel) {
  await expect(go(page)).toHaveText(expectedLabel);
  await go(page).click();
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
  await openDay(page, URL2);
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
  await expect(spent(page)).toHaveCount(1);

  await page.reload();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(page.locator('#try-line')).toHaveText('Won on try 1 of 3');
  await expect(page.locator('#controls')).toBeHidden();
  await expect(bars(page)).toHaveCount(day1.answer.length);
  await expect(page.locator('#walls-used')).toHaveText(`${day1.answer.length} / ${day1.wallBudget}`);
  // Locked: pressing the board changes nothing.
  await press(page, [0, 0, 'R']);
  await expect(bars(page)).toHaveCount(day1.answer.length);
  expect((await saved(page)).days['2026-10-27']).toMatchObject({ tries: 1, won: true, stars: 3, done: true });
});

test('three losses end the day, reveal the answer as a hint, and a reload does not give tries back', async ({ page }) => {
  await openDay(page);
  await loseOnce(page, 'Go');
  await expect(go(page)).toHaveText('Try again (2 left)');
  await expect(spent(page)).toHaveCount(1);
  await expect(result(page)).toBeHidden();
  await loseOnce(page, 'Try again (2 left)');
  await expect(go(page)).toHaveText('Try again (1 left)');
  await loseOnce(page, 'Try again (1 left)');

  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(result(page).getByRole('heading', { name: 'He made it home' })).toBeVisible();
  await expect(page.locator('#try-line')).toContainText('Lost');
  await expect(page.locator('#status')).toHaveText(`One way to fence him in (par ${day1.par}).`);
  await expect(hintBars(page)).toHaveCount(day1.answer.length);
  await expect(bars(page)).toHaveCount(day1.answer.length);
  await expect(page.locator('#controls')).toBeHidden();

  await page.reload();
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#controls')).toBeHidden();
  await expect(hintBars(page)).toHaveCount(day1.answer.length);
  await expect(spent(page)).toHaveCount(3);
  await expect(page.locator('#status')).toHaveText(`One way to fence him in (par ${day1.par}).`);
  expect((await saved(page)).days['2026-10-27']).toMatchObject({ tries: 3, won: false, done: true });
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
  await expect(spent(page)).toHaveCount(1);
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
  await expect(spent(page)).toHaveCount(1);
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
  nav('share', m === 'share' ? async (d) => { window.__shared.push(d); } : undefined);
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
  await openDay(page, URL2);
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
  await openDay(page, '/daily/?date=2026-10-29');
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(cell('Streak')).toHaveText('2');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  // A missed day ends it.
  await openDay(page, '/daily/?date=2026-10-31');
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

for (const date of ['2026-10-26', '2099-12-31', 'not-a-date']) {
  test(`${date} is outside the batch or not a date: the break message shows, with no link to the game`, async ({ page }) => {
    await page.goto(`/daily/?date=${date}`);
    if (date === 'not-a-date') {
      // An unreadable date falls back to today, which may or may not be in the batch.
      await expect(page.locator('h1')).toHaveText(/^Daily/);
      return;
    }
    await expect(page.getByText('The daily is taking a break.')).toBeVisible();
    await expect(page.locator('#game-view')).toBeHidden();
    await expect(page.locator('a')).toHaveCount(0);
  });
}

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
