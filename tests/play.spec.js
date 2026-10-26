// Playthrough tests for /play/ (rules v3: walls on lines). Answers are computed in Node by the
// engine, then pressed into the real page at the right triangle of the right tile. Nothing
// waits a fixed time: it waits for elements, so animation speed can change without breaking the suite.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseLevel, solve, simulate, findPath, buildableLines, cutsAllRoutes } from '../src/game/index.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const pack = readJson('../assets/levels/pack-01.json');
const dailyData = readJson('../assets/levels/daily.json');
const levels = pack.levels.map((l) => parseLevel(l));
const num = (i) => i + 1; // pack index -> level number in the URL

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const bars = (page) => page.locator('#board .wall-bar');
const hint = (page) => page.locator('#board .line-hint');
const go = (page) => page.getByRole('button', { name: 'Go', exact: true });
const result = (page) => page.locator('#result');
const status = (page) => page.locator('#status');

/** Where to press so the press lands in the triangle for `side` of the tile (x, y). */
async function pointFor(page, x, y, side) {
  const box = await tile(page, x, y).boundingBox();
  const f = { R: [0.88, 0.5], D: [0.5, 0.88], L: [0.12, 0.5], U: [0.5, 0.12] }[side];
  return [box.x + box.width * f[0], box.y + box.height * f[1]];
}
/** The canonical wall [x, y, dir] is pressed on tile (x, y), side dir. */
async function press(page, [x, y, dir]) {
  const [px, py] = await pointFor(page, x, y, dir);
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.up();
}
async function pressSide(page, x, y, side) {
  const [px, py] = await pointFor(page, x, y, side);
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.up();
}

async function open(page, n) {
  await page.goto(`/play/?level=${n}`);
  await expect(page.locator('#board .cell').first()).toBeVisible();
}
async function placeAll(page, list) {
  for (const w of list) await press(page, w);
}
function centre(box) { return [box.x + box.width / 2, box.y + box.height / 2]; }
const firstIndex = (pred) => levels.findIndex(pred);

/** Every line inside the board of a level, as [x, y, dir]. */
function allLines(lv) {
  const out = [];
  for (let y = 0; y < lv.size; y++) for (let x = 0; x < lv.size; x++) {
    if (x < lv.size - 1) out.push([x, y, 'R']);
    if (y < lv.size - 1) out.push([x, y, 'D']);
  }
  return out;
}
const pairOf = (lv, [x, y, dir]) => [lv.tile(x, y), lv.tile(dir === 'R' ? x + 1 : x, dir === 'D' ? y + 1 : y)];

test('level 1: the par answer wins with 3 stars and shows its par', async ({ page }) => {
  await open(page, 1);
  const { par, answer } = solve(levels[0]);
  await expect(page.locator('#par')).toHaveText(String(par));
  await placeAll(page, answer);
  await expect(bars(page)).toHaveCount(par);
  await go(page).click();
  await expect(result(page)).toBeVisible();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(result(page).getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
  await expect(result(page)).toContainText(`Par ${par}`);
  await expect(result(page)).toContainText('Out of moves');
  await expect(page.getByRole('button', { name: 'Next level' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
});

test('par, walls used and the move limit are all shown before play', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  const stats = page.locator('.stats');
  await expect(stats).toContainText('Walls');
  await expect(page.locator('#walls-used')).toHaveText(`0 / ${lv.wallBudget}`);
  await expect(stats).toContainText('Par');
  await expect(page.locator('#par')).toHaveText(String(lv.par));
  await expect(stats).toContainText('Move limit');
  await expect(page.locator('#move-limit')).toHaveText(String(lv.moveLimit));
  await expect(page.locator('#moves-left')).toHaveText(String(lv.moveLimit));
});

test('a wrong wall loses, and Try again keeps the wall', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  const wrong = buildableLines(lv).find((w) => simulate(lv, [w]).result === 'lose');
  expect(wrong).toBeTruthy();
  await press(page, wrong);
  await expect(bars(page)).toHaveCount(1);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(result(page)).toContainText(/reached the house in \d+ moves/);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(result(page)).toBeHidden();
  await expect(bars(page)).toHaveCount(1);
  await expect(page.locator(`#board .wall-bar[data-line="${wrong.join(',')}"]`)).toBeVisible();
  await expect(go(page)).toBeEnabled();
});

test('the wall budget is enforced and a placed wall can be taken back', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  const lines = buildableLines(lv);
  const mine = lines.filter((_, i) => i % 7 === 0).slice(0, lv.wallBudget + 1);
  expect(mine.length).toBe(lv.wallBudget + 1);
  await placeAll(page, mine);
  await expect(bars(page)).toHaveCount(lv.wallBudget);
  await expect(page.locator('#walls-used')).toHaveText(`${lv.wallBudget} / ${lv.wallBudget}`);
  await expect(status(page)).toContainText(`All ${lv.wallBudget} walls placed. Tap a wall to take it back.`);
  await expect(status(page)).toHaveClass(/refused/);
  await press(page, mine[0]);
  await expect(bars(page)).toHaveCount(lv.wallBudget - 1);
  await expect(status(page)).toContainText('Wall removed');
});

// Level 6 has a river, rock, bridge, teleporters, the robot and the beacon.
const GUARD_CASES = [
  ['river', (p) => p.includes('~'), /nothing to block next to a river/],
  ['rock', (p) => p.includes('#') && !p.includes('~'), /nothing to block next to a rock/],
  ['robot', (p) => p.includes('R') && !p.includes('~') && !p.includes('#'), /next to the gnome can't be walled/],
  ['beacon', (p) => p.includes('B') && !p.includes('~') && !p.includes('#'), /next to the house can't be walled/],
  ['bridge', (p) => p.includes('=') && !p.some((c) => '~#RB'.includes(c)), /next to a bridge can't be walled/],
  ['teleporter', (p) => p.some((c) => c >= 'a' && c <= 'z') && !p.some((c) => '~#RB='.includes(c)), /next to a stump can't be walled/],
];
for (const [name, pred, message] of GUARD_CASES) {
  test(`guard rule: a line next to ${name} is refused with a reason`, async ({ page }) => {
    const i = firstIndex((l) => allLines(l).some((w) => pred(pairOf(l, w))));
    expect(i, `a level with a ${name} line`).toBeGreaterThanOrEqual(0);
    const lv = levels[i];
    const line = allLines(lv).find((w) => pred(pairOf(lv, w)));
    await open(page, num(i));
    const [px, py] = await pointFor(page, line[0], line[1], line[2]);
    await page.mouse.move(px, py);
    await page.mouse.down();
    // While pressed, the line shows the "no" indicator.
    await expect(hint(page)).toHaveAttribute('data-state', 'no');
    await page.mouse.up();
    await expect(status(page)).toContainText(message);
    await expect(status(page)).toHaveClass(/refused/);
    await expect(hint(page)).toBeVisible(); // stays up, pulsing, so it can't be missed
    await expect(bars(page)).toHaveCount(0);
    await expect(page.locator('#walls-used')).toHaveText(`0 / ${lv.wallBudget}`);
  });
}

test('guard rule: the edge of the board says so', async ({ page }) => {
  await open(page, 1);
  await pressSide(page, 0, 0, 'U');
  await expect(status(page)).toContainText("That's the edge of the board");
  await pressSide(page, 6, 3, 'R');
  await expect(status(page)).toContainText("That's the edge of the board");
  await expect(bars(page)).toHaveCount(0);
});

test('pressing shows the line in cyan; moving off it cancels', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  const [a, b] = buildableLines(lv).filter((w) => w[2] === 'R').slice(0, 2);
  const [ax, ay] = await pointFor(page, a[0], a[1], 'R');
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  await expect(hint(page)).toHaveAttribute('data-state', 'ok');
  await expect(hint(page)).toHaveAttribute('data-line', a.join(','));
  // Slide onto a different line and let go: nothing is placed.
  const [bx, by] = await pointFor(page, b[0], b[1], 'R');
  await page.mouse.move(bx, by);
  await expect(hint(page)).toBeHidden();
  await page.mouse.up();
  await expect(bars(page)).toHaveCount(0);
  // Press and slide off the board entirely: also cancels.
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect(bars(page)).toHaveCount(0);
  // Press, wobble within the same line, release: commits.
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  await page.mouse.move(ax + 1, ay + 1);
  await page.mouse.up();
  await expect(bars(page)).toHaveCount(1);
});

test('every point of a tile maps to one of its four sides', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  // Tile (3,3) is interior. Its four triangles must wall four different lines (all four if buildable).
  const probes = { U: [0.5, 0.2], R: [0.8, 0.5], D: [0.5, 0.8], L: [0.2, 0.5] };
  const box = await tile(page, 3, 3).boundingBox();
  for (const [side, [fx, fy]] of Object.entries(probes)) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.mouse.down();
    const expected = { U: [3, 2, 'D'], R: [3, 3, 'R'], D: [3, 3, 'D'], L: [2, 3, 'R'] }[side];
    await expect(hint(page)).toHaveAttribute('data-line', expected.join(','));
    await page.mouse.move(2, 2);
    await page.mouse.up();
  }
  expect(lv.size).toBe(7);
});

test('teleporter: focusing one lights its partner, and a free run ends on the beacon through the jump', async ({ page }) => {
  const i = firstIndex((l) => {
    const r = findPath(l, []);
    return r && r.teleports.length > 0 && simulate(l, []).result === 'lose';
  });
  expect(i).toBeGreaterThanOrEqual(0);
  const lv = levels[i];
  await open(page, num(i));
  const free = findPath(lv, []);
  const from = free.via[free.teleports[0]];
  const to = free.positions[free.teleports[0]];
  expect(lv.partner(...from)).toEqual(to);

  await tile(page, ...from).focus();
  await expect(tile(page, ...from)).toHaveClass(/linked/);
  await expect(tile(page, ...to)).toHaveClass(/linked/);
  await expect(page.locator('#board .tele-link')).toHaveCount(1);

  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  const [rx, ry] = centre(await page.locator('#robot').boundingBox());
  const [bx, by] = centre(await tile(page, ...lv.beacon).boundingBox());
  expect(Math.abs(rx - bx)).toBeLessThan(3);
  expect(Math.abs(ry - by)).toBeLessThan(3);
  await expect(result(page)).toContainText(`${simulate(lv, []).movesUsed} moves`);
  // The trail goes on after the jump: the teleporter stepped on, its partner and the tile after are marked.
  await expect(tile(page, ...from)).toHaveClass(/trail/);
  await expect(tile(page, ...to)).toHaveClass(/trail/);
  const after = free.positions[free.teleports[0] + 1];
  if (after && !(after[0] === lv.beacon[0] && after[1] === lv.beacon[1])) await expect(tile(page, ...after)).toHaveClass(/trail/);
});

test('teleporters are numbered when there are two or more pairs', async ({ page }) => {
  const i = firstIndex((l) => new Set(l.tiles.join('').match(/[a-z]/g) || []).size >= 2);
  expect(i).toBeGreaterThanOrEqual(0);
  await open(page, num(i));
  await expect(page.locator('#board .cell.teleporter').filter({ hasText: '1' })).toHaveCount(2);
  await expect(page.locator('#board .cell.teleporter').filter({ hasText: '2' })).toHaveCount(2);
});

test('the start tile stays marked after the robot leaves it', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  await go(page).click();
  await expect(result(page)).toBeVisible();
  const style = await tile(page, ...lv.start).evaluate((el) => {
    const s = getComputedStyle(el, '::after');
    return { content: s.content, border: s.borderTopStyle };
  });
  expect(style.content).not.toBe('none');
  expect(style.border).toBe('dashed');
  const robot = await page.locator('#robot').boundingBox();
  const start = await tile(page, ...lv.start).boundingBox();
  expect(Math.abs(centre(robot)[0] - centre(start)[0]) > 3 || Math.abs(centre(robot)[1] - centre(start)[1]) > 3).toBe(true);
});

test('tile labels say what and where, and which sides have walls', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  const lines = buildableLines(lv);
  // Pick a grass tile whose right and bottom lines are both buildable.
  const [x, y] = lines.find(([lx, ly, d]) => d === 'R' && lines.some(([a, b, e]) => a === lx && b === ly && e === 'D'));
  const where = `row ${y + 1} column ${x + 1}`;
  await expect(page.getByRole('button', { name: `Grass, ${where}`, exact: true })).toBeVisible();
  await press(page, [x, y, 'R']);
  await expect(page.getByRole('button', { name: `Grass, ${where}, wall on right`, exact: true })).toBeVisible();
  await press(page, [x, y, 'D']);
  await expect(page.getByRole('button', { name: `Grass, ${where}, walls on right and bottom`, exact: true })).toBeVisible();
  // The tile on the far side of the right line sees it as its left wall.
  await expect(page.getByRole('button', { name: `Grass, row ${y + 1} column ${x + 2}, wall on left`, exact: true })).toBeVisible();
});

test('keyboard: arrows move between tiles, Shift+arrow walls a side and announces it', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  const lines = buildableLines(lv);
  const [x, y] = lines.find(([lx, ly, d]) => d === 'R' && lx > 0 && ly > 0 && ly < lv.size - 1);
  await tile(page, x - 1, y).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tile(page, x, y)).toBeFocused();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(bars(page)).toHaveCount(1);
  await expect(status(page)).toContainText('Wall placed');
  await expect(tile(page, x, y)).toHaveAccessibleName(/wall on right/);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(bars(page)).toHaveCount(0);
  await expect(status(page)).toContainText('Wall removed');
  // Refusals are announced too.
  await tile(page, 0, 0).focus();
  await page.keyboard.press('Shift+ArrowUp');
  await expect(status(page)).toContainText("That's the edge of the board");
  await expect(page.locator('#status')).toHaveAttribute('role', 'status');
});

test('level select: all 30 levels are open, and stars persist across reloads', async ({ page }) => {
  await page.goto('/play/');
  const buttons = page.locator('#select-view .level-btn');
  await expect(buttons).toHaveCount(30);
  for (const b of await buttons.all()) await expect(b).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Level 30, not played' })).toBeEnabled();
  await expect(page.locator('#play-next')).toHaveText('Play level 1');

  await page.getByRole('button', { name: /^Level 1, / }).click();
  await expect(page).toHaveURL(/level=1/);
  await placeAll(page, solve(levels[0]).answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await page.getByRole('button', { name: 'Next level' }).click();
  await expect(page.locator('h1')).toHaveText('Level 2');

  await page.goto('/play/');
  await expect(page.getByRole('button', { name: 'Level 1, 3 stars' })).toBeEnabled();
  await expect(page.locator('#play-next')).toHaveText('Play level 2');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Level 1, 3 stars' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Level 3, not played' })).toBeEnabled();
});

test('"Play level N" points at the first level without 3 stars', async ({ page }) => {
  await page.addInitScript(([a, b]) => {
    window.localStorage.setItem('invisible-maze:progress:v1', JSON.stringify({ v: 1, best: { [a]: 3, [b]: 2 } }));
  }, [levels[0].id, levels[1].id]);
  await page.goto('/play/');
  await expect(page.locator('#play-next')).toHaveText('Play level 2');
  await page.locator('#play-next').click();
  await expect(page.locator('h1')).toHaveText('Level 2');
});

test('?level=N opens that level', async ({ page }) => {
  await open(page, 12);
  await expect(page.locator('h1')).toHaveText('Level 12');
  await expect(page.locator('#board .cell')).toHaveCount(49);
});

test('the game works when storage is blocked', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    for (const k of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, k, { get() { throw new DOMException('blocked', 'SecurityError'); } });
    }
  });
  await open(page, 1);
  await placeAll(page, solve(levels[0]).answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  expect(errors).toEqual([]);
});

/* ---------- daily ---------- */

const dailyLevel = (i) => parseLevel(dailyData.levels[i]);

test('daily: a given date loads that day\'s level, shows the date, and the par answer wins', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/play/?daily&date=2026-10-28');
  await expect(page.locator('h1')).toHaveText('Daily, Wed 28 Oct');
  await expect(page.locator('#board .cell')).toHaveCount(81);
  const lv = dailyLevel(1);
  await expect(page.locator('#par')).toHaveText(String(lv.par));
  await expect(page.locator('#move-limit')).toHaveText(String(lv.moveLimit));
  await placeAll(page, solve(lv).answer);
  await go(page).click();
  // A too-far win walks the whole move limit (about 300ms a move), so give a long daily room.
  await expect(result(page)).toHaveAttribute('data-result', 'win', { timeout: 20000 });
  await expect(result(page).getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next level' })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('invisible-maze:progress:v1')).best);
  expect(saved[lv.id]).toBe(3);
  await page.getByRole('button', { name: 'Back to levels' }).click();
  await expect(page.locator('#select-view .level-btn')).toHaveCount(30);
  expect(errors).toEqual([]);
});

test('daily: the first day of the batch is level 0, and Levels | Daily tabs reach it', async ({ page }) => {
  await page.goto('/play/');
  const tabs = page.getByRole('navigation', { name: 'Mode' });
  await expect(tabs.getByRole('link', { name: 'Levels' })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: 'Daily' }).click();
  await expect(page).toHaveURL(/\?daily/);
  // Whatever today is, the page doesn't error: it shows a level or the break message.
  await expect(page.locator('h1')).toHaveText(/^Daily/);
  await page.goto('/play/?daily&date=2026-10-27');
  await expect(page.locator('h1')).toHaveText('Daily, Tue 27 Oct');
  await expect(page.locator('#board')).toBeVisible();
});

for (const date of ['2020-01-01', '2026-10-26', '2099-12-31']) {
  test(`daily: ${date} is outside the batch, so the break message shows with a way back`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/play/?daily&date=${date}`);
    await expect(page.getByText('The daily is taking a break')).toBeVisible();
    await expect(page.locator('#game-view')).toBeHidden();
    await page.getByRole('link', { name: 'Back to levels' }).click();
    await expect(page.locator('#select-view .level-btn')).toHaveCount(30);
    expect(errors).toEqual([]);
  });
}

test('daily: the last day of the batch still loads', async ({ page }) => {
  const last = dailyData.levels.at(-1).id.slice(2);
  await page.goto(`/play/?daily&date=${last}`);
  await expect(page.locator('#board .cell')).toHaveCount(81);
});

/* ---------- layout and motion ---------- */

test('a 9x9 level does not scroll sideways, with a 16px margin on a phone', async ({ page }) => {
  const i = firstIndex((l) => l.size === 9);
  await open(page, num(i));
  await expect(page.locator('#board .cell')).toHaveCount(81);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.locator('#board').boundingBox();
  const vw = page.viewportSize().width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  if (vw <= 430) {
    expect(box.x).toBeGreaterThanOrEqual(16 - 0.5);
    expect(vw - (box.x + box.width)).toBeGreaterThanOrEqual(16 - 0.5);
  }
});

// The board must fit the window in both directions, so no tile is ever below the fold on load.
for (const [w, h, label] of [[390, 844, 'phone 390x844'], [1366, 625, 'laptop 1366x625'], [1280, 585, 'laptop 1280x585']]) {
  test(`every tile of a 9x9 level is fully visible on load: ${label}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const i = firstIndex((l) => l.size === 9);
    await open(page, num(i));
    await expect(page.locator('#board .cell')).toHaveCount(81);
    const fits = () => page.evaluate(() => {
      const rects = [...document.querySelectorAll('#board .cell')].map((c) => c.getBoundingClientRect());
      return {
        top: Math.min(...rects.map((r) => r.top)),
        left: Math.min(...rects.map((r) => r.left)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
        right: Math.max(...rects.map((r) => r.right)),
        h: window.innerHeight,
        w: document.documentElement.clientWidth,
        scrollY: window.scrollY,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    // Fonts finishing loading can shift the header a little; the board re-fits, so poll.
    await expect.poll(async () => { const f = await fits(); return f.bottom <= f.h && f.right <= f.w && f.top >= 0 && f.left >= 0; }).toBe(true);
    const f = await fits();
    expect(f.scrollY).toBe(0);
    expect(f.overflowX).toBeLessThanOrEqual(0);
    // Tiles are big enough to press.
    const box = await tile(page, 0, 0).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(30);
    // Go is reachable too on a phone.
    if (w < 880) await expect(go(page)).toBeInViewport();
  });
}

test('the board still fits after the window is resized shorter', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page, 21);
  await page.setViewportSize({ width: 1280, height: 585 });
  await expect.poll(() => page.evaluate(() => {
    const r = document.querySelector('#board').getBoundingClientRect();
    return r.bottom <= window.innerHeight;
  })).toBe(true);
});

test('level select does not scroll sideways', async ({ page }) => {
  await page.goto('/play/');
  await expect(page.locator('#select-view button').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('buttons other than board tiles are at least 44px tall', async ({ page }) => {
  await open(page, 1);
  for (const b of await page.locator('#game-view button:not(.cell), #back').all()) {
    if (!(await b.isVisible())) continue;
    const box = await b.boundingBox();
    expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(44);
  }
  await page.goto('/play/');
  for (const b of await page.locator('#select-view .btn, #select-view .mode-tabs a, #select-view .level-btn').all()) {
    const box = await b.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('reduced motion: the result appears at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const i = firstIndex((l) => l.size === 9);
  await open(page, num(i));
  await go(page).click();
  await expect(result(page)).toBeVisible({ timeout: 700 });
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
});

test('the board is locked while the robot moves', async ({ page }) => {
  const i = firstIndex((l) => l.size === 9);
  await open(page, num(i));
  await go(page).click();
  await expect(go(page)).toBeDisabled();
  const lv = levels[i];
  await press(page, buildableLines(lv)[0]);
  await expect(bars(page)).toHaveCount(0);
  await expect(result(page)).toBeVisible();
});

test('every win shows the out-of-moves reason (all pack levels, par answer)', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [i, lv] of levels.entries()) {
    const { answer } = solve(lv);
    expect(simulate(lv, answer).reason, `${lv.id} engine reason`).toBe('too-far');
    await open(page, num(i));
    await placeAll(page, answer);
    await go(page).click();
    await expect(result(page), lv.id).toHaveAttribute('data-result', 'win');
    await expect(result(page), lv.id).toContainText('Out of moves');
    await expect(result(page), lv.id).not.toContainText(/No route left|cannot reach/);
  }
});

/** Smallest list of buildable lines (at most `max`) that leaves the robot no route, or null. */
function findCut(lv, max) {
  const lines = buildableLines(lv);
  const key = (w) => w.join(',');
  function dfs(walls, left) {
    const route = findPath(lv, walls);
    if (route === null) return walls;
    if (left === 0) return null;
    const onRoute = new Set(route.lines);
    for (const w of lines) {
      if (!onRoute.has((w[1] * lv.size + w[0]) * 2 + (w[2] === 'D' ? 1 : 0))) continue;
      if (walls.some((x) => key(x) === key(w))) continue;
      const got = dfs([...walls, w], left - 1);
      if (got) return got;
    }
    return null;
  }
  for (let k = 1; k <= max; k++) {
    const got = dfs([], k);
    if (got && got.length === k) return got;
  }
  return null;
}

test('a wall that would cut every route is refused with a message, and the counter does not change', async ({ page }) => {
  const i = levels.findIndex((l) => {
    const cut = findCut(l, l.wallBudget);
    return cut !== null && cut.length >= 2;
  });
  expect(i, 'a pack level where a cut fits in the budget').toBeGreaterThanOrEqual(0);
  const lv = levels[i];
  const cut = findCut(lv, lv.wallBudget);
  const last = cut[cut.length - 1];
  const before = cut.slice(0, -1);
  expect(cutsAllRoutes(lv, before)).toBe(false);
  expect(cutsAllRoutes(lv, cut)).toBe(true);
  await open(page, num(i));
  await placeAll(page, before);
  await expect(bars(page)).toHaveCount(before.length);
  await expect(page.locator('#walls-used')).toHaveText(`${before.length} / ${lv.wallBudget}`);

  const [px, py] = await pointFor(page, last[0], last[1], last[2]);
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.up();
  await expect(status(page)).toHaveText('The gnome needs at least one way through.');
  await expect(status(page)).toHaveClass(/refused/);
  await expect(hint(page)).toHaveAttribute('data-state', 'no');
  await expect(hint(page)).toBeVisible();
  await expect(bars(page)).toHaveCount(before.length);
  await expect(page.locator(`#board .wall-bar[data-line="${last.join(',')}"]`)).toHaveCount(0);
  await expect(page.locator('#walls-used')).toHaveText(`${before.length} / ${lv.wallBudget}`);
  await expect(go(page)).toBeEnabled();

  // Taking a wall back makes room: the same line is now accepted.
  await press(page, before[0]);
  await expect(bars(page)).toHaveCount(before.length - 1);
  await press(page, last);
  await expect(page.locator(`#board .wall-bar[data-line="${last.join(',')}"]`)).toBeVisible();
});

// Real touch taps (phone project only). A tap is followed by a browser click; that click must
// not be mistaken for screen-reader activation and overwrite the status line.
test('touch: a tapped wall and a refused cut keep their own status message', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'touch only');
  const i = levels.findIndex((l) => { const c = findCut(l, l.wallBudget); return c !== null && c.length >= 2; });
  const lv = levels[i];
  const cut = findCut(lv, lv.wallBudget);
  const before = cut.slice(0, -1);
  const last = cut[cut.length - 1];
  await open(page, num(i));
  for (const [x, y, dir] of before) {
    const [px, py] = await pointFor(page, x, y, dir);
    await page.touchscreen.tap(px, py);
  }
  await expect(bars(page)).toHaveCount(before.length);
  await expect(status(page)).not.toContainText('Shift');
  const [px, py] = await pointFor(page, last[0], last[1], last[2]);
  await page.touchscreen.tap(px, py);
  await expect(status(page)).toHaveText('The gnome needs at least one way through.');
  // Give a late follow-up click time to arrive, then check the message survived it.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await expect(status(page)).toHaveText('The gnome needs at least one way through.');
  await expect(page.locator('#walls-used')).toHaveText(`${before.length} / ${lv.wallBudget}`);
});

test('Replay clears the walls for a fresh attempt', async ({ page }) => {
  await open(page, 1);
  await placeAll(page, solve(levels[0]).answer);
  await go(page).click();
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(result(page)).toBeHidden();
  await expect(bars(page)).toHaveCount(0);
  await expect(go(page)).toBeEnabled();
});

/* ---------- Gnome Sweet Gnome sprites ---------- */

test('the board draws the gnome sprite inside #robot', async ({ page }) => {
  await open(page, 1);
  await expect(page.locator('#robot .gnome-sprite')).toHaveCount(1);
  await expect(page.locator('#robot .gnome-sprite')).toHaveAttribute('data-sprite', 'gnome-down-idle');
});

test('placing a wall adds a wall sprite inside its bar', async ({ page }) => {
  await open(page, 1);
  const { answer } = solve(levels[0]);
  await press(page, answer[0]);
  await expect(bars(page)).toHaveCount(1);
  await expect(bars(page).first().locator('.wall-art svg')).toHaveCount(1);
  await expect(bars(page).first()).toHaveAttribute('data-dir', /^[hv]$/);
});

test('after a teleport the gnome has no dive or pop class left on', async ({ page }) => {
  const i = firstIndex((l) => {
    const r = findPath(l, []);
    return r && r.teleports.length > 0 && simulate(l, []).result === 'lose';
  });
  await open(page, num(i));
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#robot')).not.toHaveClass(/\b(dive|pop)\b/);
});

/* ---------- Gnome Sweet Gnome menus ---------- */

test('the header wordmark says Gnome Sweet Gnome', async ({ page }) => {
  await page.goto('/play/');
  await expect(page.locator('.wordmark')).toHaveText('Gnome Sweet Gnome');
  await expect(page).toHaveTitle('Play · Gnome Sweet Gnome');
});

test('the next level to play has a gnome peeking over it', async ({ page }) => {
  await page.goto('/play/');
  const next = page.locator('.level-btn.next');
  await expect(next).toHaveCount(1);
  await expect(next.locator('.gnome-sprite')).toHaveCount(1);
  await expect(page.locator('.level-btn .gnome-sprite')).toHaveCount(1);
  await expect(next).toHaveAttribute('aria-label', 'Level 1, not played');
});

test('a win shows Fenced in! with the shrugging gnome', async ({ page }) => {
  await open(page, 1);
  await placeAll(page, solve(levels[0]).answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(result(page).getByRole('heading', { name: 'Fenced in!' })).toBeVisible();
  await expect(result(page).locator('.gnome-sprite')).toHaveAttribute('data-sprite', 'gnome-down-shrug');
});

test('a loss shows He made it home', async ({ page }) => {
  await open(page, 1);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(result(page).getByRole('heading', { name: 'He made it home' })).toBeVisible();
  await expect(result(page).getByRole('button', { name: 'Try again' })).toBeVisible();
});
