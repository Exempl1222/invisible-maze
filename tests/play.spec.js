// Playthrough tests for /play/. Answers are computed in Node by the engine, then
// tapped into the real page. Nothing here waits a fixed time: it waits for the
// result panel, so animation speed can change without breaking the suite.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseLevel, solve, simulate, findPath } from '../src/game/index.js';

const pack = JSON.parse(readFileSync(new URL('../assets/levels/pack-01.json', import.meta.url), 'utf8'));
const levels = pack.levels.map((l) => parseLevel(l));
const num = (i) => i + 1; // pack index -> level number in the URL

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const walls = (page) => page.locator('#board .cell.wall');
const go = (page) => page.getByRole('button', { name: 'Go', exact: true });
const result = (page) => page.locator('#result');

async function open(page, n) {
  await page.goto(`/play/?level=${n}`);
  await expect(page.locator('#board .cell').first()).toBeVisible();
}
async function placeAll(page, list) {
  for (const [x, y] of list) await tile(page, x, y).click();
}
function centre(box) { return [box.x + box.width / 2, box.y + box.height / 2]; }

const firstIndex = (pred) => levels.findIndex(pred);

test('level 1: the par answer wins with 3 stars and shows Par 1', async ({ page }) => {
  await open(page, 1);
  const { par, answer } = solve(levels[0]);
  expect(par).toBe(1);
  await placeAll(page, answer);
  await go(page).click();
  await expect(result(page)).toBeVisible();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(result(page).getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
  await expect(result(page)).toContainText('Par 1');
  // The win reason is spelled out in plain words, whichever it is.
  await expect(result(page)).toContainText(/No route left|Out of moves/);
  await expect(page.getByRole('button', { name: 'Next level' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
});

test('par is not shown before the level is won', async ({ page }) => {
  await open(page, 1);
  await expect(page.locator('#game-view')).not.toContainText('Par');
});

test('a wrong single wall loses, and Try again keeps the wall', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  let wrong = null;
  for (let y = 0; y < lv.size && !wrong; y++) {
    for (let x = 0; x < lv.size && !wrong; x++) {
      if (lv.buildable(x, y) && simulate(lv, [[x, y]]).result === 'lose') wrong = [x, y];
    }
  }
  expect(wrong).not.toBeNull();
  await tile(page, ...wrong).click();
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await expect(result(page)).toContainText(/reached the beacon in \d+ moves/);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(result(page)).toBeHidden();
  await expect(walls(page)).toHaveCount(1);
  await expect(tile(page, ...wrong)).toHaveClass(/wall/);
  await expect(go(page)).toBeEnabled();
});

test('the wall budget is enforced: a third grass tap is refused', async ({ page }) => {
  await open(page, 1);
  const lv = levels[0];
  expect(lv.wallBudget).toBe(2);
  const grass = [];
  for (let y = 0; y < lv.size; y++) for (let x = 0; x < lv.size; x++) if (lv.buildable(x, y)) grass.push([x, y]);
  await placeAll(page, grass.slice(0, 3));
  await expect(walls(page)).toHaveCount(2);
  await expect(page.locator('#walls-used')).toHaveText('2 / 2');
  // Tapping a placed wall takes it back, freeing a slot.
  await tile(page, ...grass[0]).click();
  await expect(walls(page)).toHaveCount(1);
});

for (const [name, ch] of [['river', '~'], ['rock', '#'], ['bridge', '='], ['teleporter', 'a'], ['robot start', 'R'], ['beacon', 'B']]) {
  test(`tapping ${name} does not place a wall`, async ({ page }) => {
    const i = firstIndex((l) => l.tiles.some((row) => row.includes(ch)));
    expect(i).toBeGreaterThanOrEqual(0);
    const lv = levels[i];
    let at = null;
    lv.tiles.forEach((row, y) => { const x = row.indexOf(ch); if (x >= 0 && !at) at = [x, y]; });
    await open(page, num(i));
    await tile(page, ...at).click();
    await expect(walls(page)).toHaveCount(0);
    await expect(page.locator('#walls-used')).toHaveText(`0 / ${lv.wallBudget}`);
  });
}

test('teleporter level with no walls: the robot ends on the beacon and the level is lost', async ({ page }) => {
  const i = firstIndex((l) => {
    const r = findPath(l, []);
    return r && r.teleports.length > 0 && simulate(l, []).result === 'lose';
  });
  expect(i).toBeGreaterThanOrEqual(0);
  const lv = levels[i];
  await open(page, num(i));
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  const robot = await page.locator('#robot').boundingBox();
  const beacon = await tile(page, ...lv.beacon).boundingBox();
  const [rx, ry] = centre(robot);
  const [bx, by] = centre(beacon);
  expect(Math.abs(rx - bx)).toBeLessThan(3);
  expect(Math.abs(ry - by)).toBeLessThan(3);
  const used = simulate(lv, []).movesUsed;
  await expect(result(page)).toContainText(`${used} moves`);
});

test('tile labels say what and where, and whether a wall is placed', async ({ page }) => {
  await open(page, 1);
  const t = page.getByRole('button', { name: 'Grass, row 1 column 1', exact: true });
  await expect(t).toBeVisible();
  await t.click();
  await expect(page.getByRole('button', { name: 'Grass, row 1 column 1, wall placed', exact: true })).toBeVisible();
});

test('level select: level 2 is locked until level 1 is won, and stars persist across reloads', async ({ page }) => {
  await page.goto('/play/');
  const l1 = page.getByRole('button', { name: /^Level 1, / });
  const l2 = page.getByRole('button', { name: /^Level 2, / });
  await expect(l1).toBeEnabled();
  await expect(l2).toBeDisabled();
  await expect(l2).toHaveAccessibleName('Level 2, locked');
  await expect(page.locator('#select-view .level-btn')).toHaveCount(30);

  await l1.click();
  await expect(page).toHaveURL(/level=1/);
  await placeAll(page, solve(levels[0]).answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await page.getByRole('button', { name: 'Next level' }).click();
  await expect(page.locator('h1')).toHaveText('Level 2');

  await page.goto('/play/');
  await expect(page.getByRole('button', { name: 'Level 1, 3 stars' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Level 2, / })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Level 1, 3 stars' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Level 3, locked' })).toBeDisabled();
});

test('?level=N ignores locks', async ({ page }) => {
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

test('a 9x9 level does not scroll sideways', async ({ page }) => {
  const i = firstIndex((l) => l.size === 9);
  await open(page, num(i));
  await expect(page.locator('#board .cell')).toHaveCount(81);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.locator('#board').boundingBox();
  const vw = page.viewportSize().width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
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
});

test('reduced motion: the result appears at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const i = firstIndex((l) => l.size === 9);
  await open(page, num(i));
  await go(page).click();
  // A 9x9 route takes seconds to animate; reduced motion must not wait for it.
  await expect(result(page)).toBeVisible({ timeout: 700 });
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
});

test('the board is locked while the robot moves', async ({ page }) => {
  const i = firstIndex((l) => l.size === 9);
  await open(page, num(i));
  await go(page).click();
  await expect(go(page)).toBeDisabled();
  const lv = levels[i];
  let g = null;
  for (let y = 0; y < lv.size && !g; y++) for (let x = 0; x < lv.size && !g; x++) if (lv.buildable(x, y)) g = [x, y];
  await tile(page, ...g).click({ force: true });
  await expect(walls(page)).toHaveCount(0);
  await expect(result(page)).toBeVisible();
});

for (const [reason, words] of [['blocked', 'No route left'], ['too-far', 'Out of moves']]) {
  test(`win reason in plain words: ${reason}`, async ({ page }) => {
    const i = firstIndex((l) => simulate(l, solve(l).answer).reason === reason);
    expect(i, `a pack level whose par answer wins by ${reason}`).toBeGreaterThanOrEqual(0);
    await open(page, num(i));
    await placeAll(page, solve(levels[i]).answer);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win');
    await expect(result(page)).toContainText(words);
  });
}

test('Replay clears the walls for a fresh attempt', async ({ page }) => {
  await open(page, 1);
  await placeAll(page, solve(levels[0]).answer);
  await go(page).click();
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(result(page)).toBeHidden();
  await expect(walls(page)).toHaveCount(0);
  await expect(go(page)).toBeEnabled();
});
