// Lab tab (experimental rules v4) and hints, on every kind of level. Like play.spec.js, answers are
// computed in Node by the engine and pressed into the real page; nothing waits a fixed time.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseLevel, solve, cutsAllRoutes, buildableLines, wouldBreakCap, capViolation } from '../src/game/index.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const pack = readJson('../assets/levels/pack-01.json');
const labData = readJson('../assets/levels/lab.json');
const dailyData = readJson('../assets/levels/daily.json');
const levels = pack.levels.map((l) => parseLevel(l));
const labLevels = labData.levels.map((l) => parseLevel(l));

const PROGRESS = 'invisible-maze:progress:v1';
const HINTS = 'invisible-maze:hints:v1';

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const bars = (page) => page.locator('#board .wall-bar');
const hintBars = (page) => page.locator('#board .wall-bar[data-hint="1"]');
const go = (page) => page.getByRole('button', { name: 'Go', exact: true });
const hintBtn = (page) => page.locator('#hint-btn');
const result = (page) => page.locator('#result');
const status = (page) => page.locator('#status');

async function pointFor(page, x, y, side) {
  const box = await tile(page, x, y).boundingBox();
  const f = { R: [0.88, 0.5], D: [0.5, 0.88], L: [0.12, 0.5], U: [0.5, 0.12] }[side];
  return [box.x + box.width * f[0], box.y + box.height * f[1]];
}
async function press(page, [x, y, dir]) {
  const [px, py] = await pointFor(page, x, y, dir);
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.up();
}
/** A real touch tap on the wall line. */
async function tapLine(page, [x, y, dir]) {
  const [px, py] = await pointFor(page, x, y, dir);
  await page.touchscreen.tap(px, py);
}
/** A real touch tap on an element when the project has touch, otherwise a click. */
async function tapOn(page, locator, hasTouch) {
  if (!hasTouch) { await locator.click(); return; }
  const box = await locator.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
async function placeAll(page, list) {
  for (const w of list) await press(page, w);
}
async function openPack(page, n) {
  await page.goto(`/play/?level=${n}`);
  await expect(page.locator('#board .cell').first()).toBeVisible();
}
async function openLab(page, n) {
  await page.goto(`/play/?lab=${n}`);
  await expect(page.locator('#board .cell').first()).toBeVisible();
}
const setStorage = (page, key, value) => page.addInitScript(([k, v]) => {
  // Only seed once, so a reload in the same test sees what the page saved.
  if (!window.sessionStorage.getItem(`seeded:${k}`)) {
    window.localStorage.setItem(k, JSON.stringify(v));
    window.sessionStorage.setItem(`seeded:${k}`, '1');
  }
}, [key, value]);
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

/* ---------- lab ---------- */

test('lab: the tab lists 5 levels with the experiments note', async ({ page }) => {
  await page.goto('/play/');
  const tabs = page.getByRole('navigation', { name: 'Mode' });
  await expect(tabs.getByRole('link')).toHaveText(['Levels', 'Daily', 'Lab']);
  await tabs.getByRole('link', { name: 'Lab' }).click();
  await expect(page).toHaveURL(/\?lab$/);
  await expect(page.locator('h1')).toHaveText('Lab');
  await expect(tabs.getByRole('link', { name: 'Lab' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#select-view .level-btn')).toHaveCount(5);
  await expect(page.locator('#lab-note')).toHaveText('Experiments: new rules are tried here before they reach the main game. These five levels introduced the current rules (their bridges predate the bridge fix).');
  await expect(page.getByRole('button', { name: 'Lab 1, not played' })).toBeVisible();
  // the other tabs still work from here
  await tabs.getByRole('link', { name: 'Levels' }).click();
  await expect(page.locator('#select-view .level-btn')).toHaveCount(30);
});

test('lab: ?lab=N opens that lab level, and Back returns to the lab list', async ({ page }) => {
  await openLab(page, 3);
  await expect(page.locator('h1')).toHaveText('Lab 3');
  await expect(page.locator('#board .cell')).toHaveCount(81);
  await expect(page.locator('#par')).toHaveText(String(labLevels[2].par));
  await expect(page.locator('#walls-used')).toHaveText(`0 / ${labLevels[2].wallBudget}`);
  await page.getByRole('link', { name: 'All lab levels' }).click();
  await expect(page).toHaveURL(/\?lab$/);
  await expect(page.locator('#select-view .level-btn')).toHaveCount(5);
});

for (let i = 0; i < 5; i++) {
  test(`lab: level ${i + 1} par answer wins with 3 stars`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLab(page, i + 1);
    const lv = labLevels[i];
    await placeAll(page, lv.answer);
    await expect(bars(page)).toHaveCount(lv.par);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win');
    await expect(result(page).getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
    const saved = await stored(page, PROGRESS);
    expect(saved.best[lv.id]).toBe(3);
    await page.getByRole('link', { name: 'All lab levels' }).click();
    await expect(page.getByRole('button', { name: `Lab ${i + 1}, 3 stars` })).toBeVisible();
  });
}

/** A line with a bridge on one side and a walkable tile on the other that the lab accepts without cutting. */
function bridgeLine(lv) {
  return buildableLines(lv).find(([x, y, d]) => {
    const pair = [lv.tile(x, y), lv.tile(d === 'R' ? x + 1 : x, d === 'D' ? y + 1 : y)];
    return pair.includes('=') && !cutsAllRoutes(lv, [[x, y, d]]);
  });
}

test('a line next to a bridge is accepted in the lab and in the pack (rules v4 everywhere)', async ({ page }) => {
  const li = labLevels.findIndex((l) => bridgeLine(l));
  expect(li, 'a lab level with a wallable bridge line').toBeGreaterThanOrEqual(0);
  const line = bridgeLine(labLevels[li]);
  await openLab(page, li + 1);
  await press(page, line);
  await expect(bars(page)).toHaveCount(1);
  await expect(page.locator(`#board .wall-bar[data-line="${line.join(',')}"]`)).toBeVisible();
  await expect(page.locator('#walls-used')).toHaveText(`1 / ${labLevels[li].wallBudget}`);

  // the same kind of line in the pack
  const pi = levels.findIndex((l) => bridgeLine(l));
  expect(pi, 'a pack level with a wallable bridge line').toBeGreaterThanOrEqual(0);
  const packLine = bridgeLine(levels[pi]);
  await openPack(page, pi + 1);
  await press(page, packLine);
  await expect(bars(page)).toHaveCount(1);
  await expect(page.locator(`#board .wall-bar[data-line="${packLine.join(',')}"]`)).toBeVisible();
});

/** In some lab level: two lines touching `kind` ('start' or 'beacon') that fit together, and a third that breaks the cap. */
function capCase(kind) {
  for (let i = 0; i < labLevels.length; i++) {
    const lv = labLevels[i];
    const [cx, cy] = kind === 'start' ? lv.start : lv.beacon;
    const around = [[cx, cy, 'R'], [cx, cy, 'D'], [cx - 1, cy, 'R'], [cx, cy - 1, 'D']].filter(([x, y, d]) => lv.lineBuildable(x, y, d));
    for (let a = 0; a < around.length; a++) for (let b = a + 1; b < around.length; b++) for (let c = 0; c < around.length; c++) {
      if (c === a || c === b) continue;
      const first = [around[a], around[b]];
      if (cutsAllRoutes(lv, first) || wouldBreakCap(lv, first, around[c]) !== kind) continue;
      return { i, kind, first, third: around[c] };
    }
  }
  return null;
}

for (const kind of ['start', 'beacon']) {
  test(`lab: a third wall on the ${kind === 'start' ? 'robot' : 'beacon'} is refused with the two-sides message`, async ({ page, hasTouch }) => {
    const c = capCase(kind);
    expect(c, `a lab level with three wallable lines around the ${kind}`).not.toBeNull();
    const { i, first, third } = c;
    await openLab(page, i + 1);
    await placeAll(page, first);
    await expect(bars(page)).toHaveCount(2);
    if (hasTouch) await tapLine(page, third); else await press(page, third);
    await expect(status(page)).toHaveText(kind === 'start' ? 'The robot can only be walled on two sides.' : 'The beacon can only be walled on two sides.');
    await expect(status(page)).toHaveClass(/refused/);
    await expect(bars(page)).toHaveCount(2);
    await expect(page.locator('#walls-used')).toHaveText(`2 / ${labLevels[i].wallBudget}`);
  });
}

/* ---------- hints ---------- */

const answerKeys = (lv) => new Set(lv.answer.map((w) => w.join(',')));

test('hint: places a wall from the answer in the hint style, counts it, and the count persists across a reload', async ({ page, hasTouch }) => {
  await openPack(page, 1);
  const lv = levels[0];
  await expect(hintBtn(page)).toHaveText('Hint (3)');
  await expect(page.locator('#hint-cost')).toContainText('Uses 1 hint and costs 1 star on this level');
  await tapOn(page, hintBtn(page), hasTouch);
  await expect(hintBars(page)).toHaveCount(1);
  await expect(bars(page)).toHaveCount(1);
  const line = await hintBars(page).getAttribute('data-line');
  expect(answerKeys(lv).has(line)).toBe(true);
  await expect(hintBtn(page)).toHaveText('Hint (2)');
  await expect(page.locator('#walls-used')).toHaveText(`1 / ${lv.wallBudget}`);
  await expect(status(page)).toContainText('Hint placed');
  // a late browser click after a touch must not overwrite the message
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await expect(status(page)).toContainText('Hint placed');

  await page.reload();
  await expect(hintBtn(page)).toHaveText('Hint (2)');
  await expect(bars(page)).toHaveCount(0); // hint walls belong to the attempt, not to storage
  expect((await stored(page, HINTS)).count).toBe(2);
});

test('hint: a hint wall cannot be removed by tapping, Clear walls keeps it, and a second hint places a different wall', async ({ page, hasTouch }) => {
  await openPack(page, 1);
  const lv = levels[0];
  await hintBtn(page).click();
  const first = (await hintBars(page).getAttribute('data-line')).split(',');
  const line = [Number(first[0]), Number(first[1]), first[2]];
  if (hasTouch) await tapLine(page, line); else await press(page, line);
  await expect(hintBars(page)).toHaveCount(1);
  await expect(status(page)).toContainText('hint');
  await expect(status(page)).toHaveClass(/refused/);
  await expect(page.locator('#walls-used')).toHaveText(`1 / ${lv.wallBudget}`);

  // own wall: add one that is not on the answer, then Clear walls
  const own = buildableLines(lv).find((w) => !answerKeys(lv).has(w.join(',')) && !cutsAllRoutes(lv, [line, w]));
  await press(page, own);
  await expect(bars(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear walls' }).click();
  await expect(bars(page)).toHaveCount(1);
  await expect(hintBars(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Clear walls' })).toBeDisabled();

  await hintBtn(page).click();
  await expect(hintBars(page)).toHaveCount(2);
  const keys = await hintBars(page).evaluateAll((els) => els.map((e) => e.dataset.line));
  expect(new Set(keys).size).toBe(2);
  await expect(hintBtn(page)).toHaveText('Hint (1)');
});

test('hint: a hinted par win scores 2 stars and says so; Replay keeps the hint wall; best stars keep the highest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const lv = levels[0];
  await setStorage(page, PROGRESS, { v: 1, best: { [lv.id]: 3 } });
  await openPack(page, 1);
  await hintBtn(page).click();
  const hinted = await hintBars(page).getAttribute('data-line');
  const rest = lv.answer.filter((w) => w.join(',') !== hinted);
  await placeAll(page, rest);
  await expect(bars(page)).toHaveCount(lv.par);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(result(page).getByRole('img', { name: '2 of 3 stars' })).toBeVisible();
  await expect(page.locator('#hint-used')).toHaveText('1 hint used, −1 star.');
  expect((await stored(page, PROGRESS)).best[lv.id]).toBe(3); // the earlier 3 stays

  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(bars(page)).toHaveCount(1);
  await expect(hintBars(page)).toHaveCount(1);
  await expect(page.locator('#walls-used')).toHaveText(`1 / ${lv.wallBudget}`);
});

test('hint: a hinted win with no earlier score records 2 stars', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const lv = levels[0];
  await openPack(page, 1);
  await hintBtn(page).click();
  const hinted = await hintBars(page).getAttribute('data-line');
  await placeAll(page, lv.answer.filter((w) => w.join(',') !== hinted));
  await go(page).click();
  await expect(result(page).getByRole('img', { name: '2 of 3 stars' })).toBeVisible();
  expect((await stored(page, PROGRESS)).best[lv.id]).toBe(2);
});

test('hint: Try again after a loss keeps the hint wall', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const lv = levels[0];
  await openPack(page, 1);
  await hintBtn(page).click();
  await go(page).click(); // one hint wall alone doesn't stop the robot
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(hintBars(page)).toHaveCount(1);
  await expect(page.locator('#walls-used')).toHaveText(`1 / ${lv.wallBudget}`);
});

test('hint: refused when the board is full, and the hint is not spent', async ({ page, hasTouch }) => {
  await openPack(page, 1);
  const lv = levels[0];
  const mine = buildableLines(lv).filter((w) => !answerKeys(lv).has(w.join(','))).filter((_, i) => i % 7 === 0).slice(0, lv.wallBudget);
  await placeAll(page, mine);
  await expect(page.locator('#walls-used')).toHaveText(`${lv.wallBudget} / ${lv.wallBudget}`);
  await tapOn(page, hintBtn(page), hasTouch);
  await expect(status(page)).toContainText('no room for a hint wall');
  await expect(status(page)).toContainText('No hint used');
  await expect(status(page)).toHaveClass(/refused/);
  await expect(hintBtn(page)).toHaveText('Hint (3)');
  await expect(bars(page)).toHaveCount(lv.wallBudget);
  await expect(hintBars(page)).toHaveCount(0);
});

test('hint: says so when the whole answer is already on the board, and is not spent', async ({ page }) => {
  await openPack(page, 1);
  const lv = levels[0];
  await placeAll(page, lv.answer);
  await hintBtn(page).click();
  await expect(status(page)).toContainText('already on the board');
  await expect(hintBtn(page)).toHaveText('Hint (3)');
  await expect(hintBars(page)).toHaveCount(0);
});

/**
 * Found by search on the shipped pack (no level numbers hardcoded): a level and one or two legal walls of the
 * player's such that every remaining answer wall is refused because it would cut every route, while taking
 * the first of them back lets some answer wall go down. There is room in the budget, so the budget isn't the reason.
 */
function hintCutCase() {
  const same = (a, b) => a.join() === b.join();
  const refusedForCut = (lv, own, a) => !own.some((o) => same(o, a)) && !wouldBreakCap(lv, own, a) && cutsAllRoutes(lv, [...own, a]);
  const legal = (lv, own, a) => !own.some((o) => same(o, a)) && !wouldBreakCap(lv, own, a) && !cutsAllRoutes(lv, [...own, a]);
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i];
    const lines = buildableLines(lv).filter((w) => !lv.answer.some((a) => same(a, w)));
    const ok = (own) => own.length < lv.wallBudget && !capViolation(lv, own) && !cutsAllRoutes(lv, own)
      && lv.answer.every((a) => refusedForCut(lv, own, a)) && lv.answer.some((a) => legal(lv, own.slice(1), a));
    for (const w of lines) if (ok([w])) return { i, own: [w] };
    if (lv.wallBudget >= 3) for (const w of lines) for (const v of lines) if (!same(w, v) && ok([w, v])) return { i, own: [w, v] };
  }
  return null;
}

test('hint: refused, not spent, when the player\'s walls leave no legal answer wall (it would cut every route)', async ({ page }) => {
  const found = hintCutCase();
  expect(found, 'a pack level where own walls make every answer wall cut the robot off').not.toBeNull();
  const { i, own } = found;
  await openPack(page, i + 1);
  await placeAll(page, own);
  await expect(bars(page)).toHaveCount(own.length);
  await hintBtn(page).click();
  await expect(status(page)).toContainText('cut off the robot');
  await expect(status(page)).toContainText('No hint used');
  await expect(hintBtn(page)).toHaveText('Hint (3)');
  await expect(hintBars(page)).toHaveCount(0);
  // Taking one wall back makes the hint legal again.
  await press(page, own[0]);
  await hintBtn(page).click();
  await expect(hintBars(page)).toHaveCount(1);
});

test('hint: at 0 the button opens the out-of-hints panel with a disabled ad button', async ({ page, hasTouch }) => {
  await setStorage(page, HINTS, { v: 1, count: 0, earned: [] });
  await openPack(page, 1);
  await expect(hintBtn(page)).toHaveText('Hint (0)');
  await expect(page.locator('#hint-panel')).toBeHidden();
  await tapOn(page, hintBtn(page), hasTouch);
  const panel = page.locator('#hint-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Out of hints. Finish today's daily for 1 more. More hints from ads are coming soon.");
  await expect(panel.getByRole('button', { name: 'Watch an ad' })).toBeDisabled();
  await expect(bars(page)).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
});

test('hint: works on a daily level and on a lab level', async ({ page }) => {
  await page.goto('/play/?daily&date=2026-10-28');
  await expect(page.locator('#board .cell')).toHaveCount(81);
  await hintBtn(page).click();
  const dailyLv = parseLevel(dailyData.levels[1]);
  expect(answerKeys(dailyLv).has(await hintBars(page).getAttribute('data-line'))).toBe(true);
  await openLab(page, 5);
  await expect(hintBtn(page)).toHaveText('Hint (2)');
  await hintBtn(page).click();
  const lab5 = labLevels[4];
  expect(answerKeys(lab5).has(await hintBars(page).getAttribute('data-line'))).toBe(true);
  await expect(hintBtn(page)).toHaveText('Hint (1)');
});

test('hint: the inventory works in memory when storage is blocked', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    for (const k of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, k, { get() { throw new DOMException('blocked', 'SecurityError'); } });
    }
  });
  await openPack(page, 1);
  await hintBtn(page).click();
  await expect(hintBars(page)).toHaveCount(1);
  await expect(hintBtn(page)).toHaveText('Hint (2)');
  expect(errors).toEqual([]);
});

/* ---------- earning hints from the daily ---------- */

async function winDaily(page, date, idx) {
  await page.goto(`/play/?daily&date=${date}`);
  await expect(page.locator('#board .cell')).toHaveCount(81);
  await placeAll(page, parseLevel(dailyData.levels[idx]).answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
}

test('daily: finishing a daily earns 1 hint, once per date', async ({ page, hasTouch }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await winDaily(page, '2026-10-28', 1);
  await expect(page.locator('#hint-earned')).toHaveText('Daily done: +1 hint. You have 4.');
  expect((await stored(page, HINTS)).count).toBe(4);
  // the same date again: no second hint
  await winDaily(page, '2026-10-28', 1);
  await expect(page.locator('#hint-earned')).toHaveCount(0);
  expect((await stored(page, HINTS)).count).toBe(4);
  // a different date pays out
  await winDaily(page, '2026-10-29', 2);
  await expect(page.locator('#hint-earned')).toHaveText('Daily done: +1 hint. You have 5.');
  expect((await stored(page, HINTS)).count).toBe(5);
  // and the new count shows on a level
  await openPack(page, 1);
  await expect(hintBtn(page)).toHaveText('Hint (5)');
  void hasTouch;
});

test('daily: a lost daily earns nothing, and the inventory stops at 10', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/play/?daily&date=2026-10-28');
  await expect(page.locator('#board .cell')).toHaveCount(81);
  await go(page).click(); // no walls: the robot gets through
  await expect(result(page)).toHaveAttribute('data-result', 'lose');
  expect(await page.evaluate((k) => localStorage.getItem(k), HINTS)).toBeNull();

  await setStorage(page, HINTS, { v: 1, count: 10, earned: [] });
  await page.reload();
  await expect(hintBtn(page)).toHaveText('Hint (10)');
  await placeAll(page, parseLevel(dailyData.levels[1]).answer);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win');
  await expect(page.locator('#hint-earned')).toHaveCount(0);
  expect((await stored(page, HINTS)).count).toBe(10);
});

test('hints: a hinted daily win still earns the daily hint and scores one star lower', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/play/?daily&date=2026-10-28');
  await expect(page.locator('#board .cell')).toHaveCount(81);
  const lv = parseLevel(dailyData.levels[1]);
  await hintBtn(page).click();
  const hinted = await hintBars(page).getAttribute('data-line');
  await placeAll(page, lv.answer.filter((w) => w.join(',') !== hinted));
  await go(page).click();
  await expect(result(page).getByRole('img', { name: '2 of 3 stars' })).toBeVisible();
  await expect(page.locator('#hint-earned')).toHaveText('Daily done: +1 hint. You have 3.'); // 3 - 1 spent + 1 earned
});
