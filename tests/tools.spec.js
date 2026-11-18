// Gnome tools on the Play page (parcel 8g): the badge, the replay (ladder, pickaxe, plank) and the Lab levels lab5-08 to 13.
// Answers come from the engine in Node and are pressed into the real page. Lab 1 to 5 are v4, Lab 6 to 12 the new tiles, Lab 13 to 18 the tools.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseLevel, simulate, buildableLines, cutsAllRoutes, wouldBreakCap } from '../src/game/index.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const labV4 = readJson('../assets/levels/lab.json');
const labV5 = readJson('../assets/levels/lab-v5.json');
const V4 = labV4.levels.length;
const all = labV5.levels.map((l) => parseLevel(l));
const toolIdx = all.map((l, i) => (l.tool ? i : -1)).filter((i) => i >= 0);
const PROGRESS = 'invisible-maze:progress:v1';
const TEXT = {
  ladder: 'He brought a ladder: he can climb one of your fences, once.',
  pickaxe: 'He brought a pickaxe: he can dig through one rock or berry bush, once.',
  plank: 'He brought a plank: he can cross one river tile, once.',
};

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const go = (page) => page.getByRole('button', { name: 'Go', exact: true });
const result = (page) => page.locator('#result');
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function press(page, [x, y, dir]) {
  await tile(page, x, y).scrollIntoViewIfNeeded();
  const box = await tile(page, x, y).boundingBox();
  const f = { R: [0.88, 0.5], D: [0.5, 0.88] }[dir];
  await page.mouse.move(box.x + box.width * f[0], box.y + box.height * f[1]);
  await page.mouse.down();
  await page.mouse.up();
}
async function open(page, k) { // k indexes the v5 lab levels
  await page.goto(`/play/?lab=${V4 + k + 1}`);
  await expect(page.locator('#board .cell').first()).toBeVisible();
}
/** Record every robot and cell class, every prop and every moves-left value from now on. */
async function watch(page) {
  await page.evaluate(() => {
    const seen = { robot: new Set(), cells: new Set(), props: new Set(), propClasses: new Set(), moves: [] };
    window.__seen = seen;
    const robot = document.getElementById('robot');
    new MutationObserver(() => robot.classList.forEach((c) => seen.robot.add(c))).observe(robot, { attributes: true, attributeFilter: ['class'] });
    const board = document.getElementById('board');
    const note = (el) => {
      if (el.classList?.contains('cell')) el.classList.forEach((c) => seen.cells.add(c));
      if (el.classList?.contains('tool-prop')) { seen.props.add(el.dataset.prop); el.classList.forEach((c) => seen.propClasses.add(c)); }
    };
    new MutationObserver((list) => {
      for (const m of list) {
        note(m.target);
        m.addedNodes.forEach((n) => note(n));
      }
    }).observe(board, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    const mv = document.getElementById('moves-left');
    new MutationObserver(() => {
      const v = Number(mv.textContent);
      if (seen.moves.at(-1) !== v) seen.moves.push(v);
    }).observe(mv, { childList: true, characterData: true, subtree: true });
    seen.moves.push(Number(mv.textContent));
  });
}
const seen = (page) => page.evaluate(() => ({ robot: [...window.__seen.robot], cells: [...window.__seen.cells], props: [...window.__seen.props], propClasses: [...window.__seen.propClasses], moves: window.__seen.moves }));

test('the lab tab lists the six tool levels under "Gnome tools"', async ({ page }) => {
  expect(toolIdx.map((i) => all[i].tool)).toEqual(['ladder', 'ladder', 'pickaxe', 'pickaxe', 'plank', 'plank']);
  await page.goto('/play/?lab');
  await expect(page.locator('#lab-tools-title')).toHaveText('Gnome tools');
  await expect(page.locator('#select-view .lab-tool-btn')).toHaveCount(6);
  for (const i of toolIdx) await expect(page.getByRole('button', { name: `Lab ${V4 + i + 1}, not played` })).toBeVisible();
  const a = await page.locator('#select-view .lab-new-btn').last().boundingBox();
  const b = await page.locator('#lab-tools-title').boundingBox();
  expect(b.y).toBeGreaterThan(a.y + a.height);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('the tool badge shows what he brought on a tool level, with a label, and is hidden elsewhere', async ({ page }) => {
  for (const i of toolIdx) {
    await open(page, i);
    const badge = page.locator('#tool-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('aria-label', `Gnome's tool: ${all[i].tool}`);
    await expect(badge).toContainText(TEXT[all[i].tool]);
    // it sits above the board, readable at 390px
    const bb = await badge.boundingBox();
    const board = await page.locator('#board').boundingBox();
    if (page.viewportSize().width < 880) expect(bb.y + bb.height).toBeLessThanOrEqual(board.y + 1); // above the board on a phone (beside it on desktop)
    expect(bb.x).toBeGreaterThanOrEqual(0);
    expect(bb.x + bb.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(await overflow(page), `${all[i].id} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  // not on a v5 level without a tool, a v4 lab level, or a pack level
  for (const url of [`/play/?lab=${V4 + 1}`, '/play/?lab=1', '/play/?level=1']) {
    await page.goto(url);
    await expect(page.locator('#board .cell').first()).toBeVisible();
    await expect(page.locator('#tool-badge')).toBeHidden();
  }
  // going from a tool level to a level without one hides it again
  await open(page, toolIdx[0]);
  await expect(page.locator('#tool-badge')).toBeVisible();
  await page.goto('/play/?lab=1');
  await expect(page.locator('#tool-badge')).toBeHidden();
});

for (const i of toolIdx) {
  const lv = all[i];
  test(`${lv.id} (${lv.tool}): the stored answer wins with 3 stars, replay animates the tool and moves-left ticks once per move`, async ({ page }) => {
    const sim = simulate(lv, lv.answer);
    expect(sim.toolStep, 'the engine has him use the tool').not.toBeNull();
    await open(page, i);
    await expect(page.locator('#par')).toHaveText(String(lv.par));
    for (const w of lv.answer) await press(page, w);
    await expect(page.locator('#board .wall-bar')).toHaveCount(lv.par);
    await watch(page);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win', { timeout: 30000 });
    await expect(result(page).getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS);
    expect(saved.best[lv.id]).toBe(3);

    const s = await seen(page);
    const moves = sim.steps.length - 1;
    expect(s.moves, `${lv.id}: moves-left shows every move exactly once (the prep move counts)`).toEqual(Array.from({ length: moves + 1 }, (_, k) => lv.moveLimit - k));
    if (lv.tool === 'ladder') {
      expect(s.props).toContain('ladder');
      expect(s.propClasses).toEqual(expect.arrayContaining(['set', 'tip']));
      expect(s.robot).toContain('hop');
    } else if (lv.tool === 'pickaxe') {
      expect(s.props.some((p) => p === 'pickaxe' || p === 'scythe')).toBe(true);
      expect(s.propClasses).toContain('swing');
      expect(s.cells).toEqual(expect.arrayContaining(['crumble', 'dug']));
    } else {
      expect(s.props).toContain('plank');
      expect(s.propClasses).toEqual(expect.arrayContaining(['lay', 'float']));
    }
    // everything the replay added is cleaned up by the end
    await expect(page.locator('#board .tool-prop')).toHaveCount(0, { timeout: 5000 });
    const t = sim.toolUse;
    if (lv.tool === 'pickaxe') await expect(tile(page, t.tile[0], t.tile[1])).toHaveClass(/dug/);
  });

  test(`${lv.id} (${lv.tool}): reduced motion jumps to the end, no props, board state right`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const sim = simulate(lv, lv.answer);
    await open(page, i);
    for (const w of lv.answer) await press(page, w);
    await watch(page);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win');
    const s = await seen(page);
    expect(s.props).toEqual([]);
    expect(s.robot).not.toContain('hop');
    expect(s.cells).not.toContain('crumble');
    await expect(page.locator('#moves-left')).toHaveText(String(lv.moveLimit - (sim.steps.length - 1)));
    const dug = page.locator('#board .cell.dug');
    if (lv.tool === 'pickaxe') {
      await expect(dug).toHaveCount(1);
      await expect(dug).toHaveCSS('background-image', /tile-pebbles\.svg/);
      await expect(tile(page, sim.toolUse.tile[0], sim.toolUse.tile[1])).toHaveClass(/dug/);
    } else await expect(dug).toHaveCount(0);
  });
}

test('a pickaxe level with no fences: he may not need the tool, so nothing is dug; levels without a tool never get tool classes', async ({ page }) => {
  // no fences on a ladder level: the free route does not use a ladder (nothing to climb), so no ladder prop appears
  await open(page, toolIdx[0]);
  await watch(page);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'lose', { timeout: 30000 });
  expect((await seen(page)).props).toEqual([]);
  // a v4 and a non-tool v5 level never take the tool animation classes
  for (const url of ['/play/?level=1', `/play/?lab=${V4 + 1}`]) {
    await page.goto(url);
    await expect(page.locator('#board .cell').first()).toBeVisible();
    await watch(page);
    await go(page).click();
    await expect(result(page)).toBeVisible({ timeout: 30000 });
    const s = await seen(page);
    expect(s.props).toEqual([]);
    for (const c of ['hop']) expect(s.robot).not.toContain(c);
    for (const c of ['crumble', 'dug']) expect(s.cells).not.toContain(c);
  }
});

test('no console errors and no sideways scroll across the tool levels, one full animated run each', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`${r.status()} ${r.url()}`); });
  for (const i of toolIdx) {
    await open(page, i);
    for (const w of all[i].answer) await press(page, w);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win', { timeout: 30000 });
    expect(await overflow(page), `${all[i].id}`).toBeLessThanOrEqual(0);
  }
  expect(errors.filter((e) => !/fonts\.(googleapis|gstatic)/.test(e))).toEqual([]);
});

test('on a tool level the no-cut refusal says the tool does not count', async ({ page }) => {
  // Engine: the first legal fence pair whose second fence leaves him no way home without his tool.
  let k = -1, pair = null;
  for (const i of toolIdx) {
    const lv = all[i];
    const lines = buildableLines(lv);
    for (const a of lines) {
      if (cutsAllRoutes(lv, [a])) continue;
      const b = lines.find((l) => l !== a && !wouldBreakCap(lv, [a], l) && cutsAllRoutes(lv, [a, l]));
      if (b) { pair = [a, b]; break; }
    }
    if (pair) { k = i; break; }
  }
  expect(pair).not.toBeNull();
  await open(page, k);
  await press(page, pair[0]);
  await press(page, pair[1]);
  await expect(page.locator('#status')).toHaveText(`The gnome needs at least one way through without his ${all[k].tool}.`);
});
