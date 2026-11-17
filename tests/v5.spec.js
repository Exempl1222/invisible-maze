// Rules v5 on the Play page (parcel 8d): the lab levels for ice, mud and gates draw and play. Like
// lab.spec.js, answers come from the engine in Node and are pressed into the real page; nothing
// waits a fixed time. Lab 1 to 5 are the v4 lab levels; the v5 ones are Lab 6 and up.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseLevel, simulate } from '../src/game/index.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const labV4 = readJson('../assets/levels/lab.json');
const labV5 = readJson('../assets/levels/lab-v5.json');
const V4 = labV4.levels.length;
const levels = labV5.levels.map((l) => parseLevel(l));
const PROGRESS = 'invisible-maze:progress:v1';

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const go = (page) => page.getByRole('button', { name: 'Go', exact: true });
const result = (page) => page.locator('#result');
const movesLeft = (page) => page.locator('#moves-left');

async function press(page, [x, y, dir]) {
  await tile(page, x, y).scrollIntoViewIfNeeded();
  const box = await tile(page, x, y).boundingBox();
  const f = { R: [0.88, 0.5], D: [0.5, 0.88] }[dir];
  await page.mouse.move(box.x + box.width * f[0], box.y + box.height * f[1]);
  await page.mouse.down();
  await page.mouse.up();
}
async function openV5(page, k) { // k is 0-based within the v5 levels
  await page.goto(`/play/?lab=${V4 + k + 1}`);
  await expect(page.locator('#board .cell').first()).toBeVisible();
}
const hasSlide = (sim) => sim.trails.some((t) => t.length > 1);

/** Record every class the gnome and the gate tiles ever carry, and every value of the moves-left counter, from now on. */
async function watch(page) {
  await page.evaluate(() => {
    const seen = { robot: new Set(), cells: new Set(), moves: [] };
    window.__seen = seen;
    const robot = document.getElementById('robot');
    const note = () => robot.classList.forEach((c) => seen.robot.add(c));
    new MutationObserver(note).observe(robot, { attributes: true, attributeFilter: ['class'] });
    const board = document.getElementById('board');
    new MutationObserver((list) => {
      for (const m of list) if (m.target.classList?.contains('cell')) m.target.classList.forEach((c) => seen.cells.add(c));
    }).observe(board, { attributes: true, attributeFilter: ['class'], subtree: true });
    const mv = document.getElementById('moves-left');
    new MutationObserver(() => {
      const v = Number(mv.textContent);
      if (seen.moves.at(-1) !== v) seen.moves.push(v);
    }).observe(mv, { childList: true, characterData: true, subtree: true });
    seen.moves.push(Number(mv.textContent));
  });
}
const seen = (page) => page.evaluate(() => ({ robot: [...window.__seen.robot], cells: [...window.__seen.cells], moves: window.__seen.moves }));

test('lab tab: the five v4 levels, then the new tiles under their own heading', async ({ page }) => {
  await page.goto('/play/?lab');
  await expect(page.locator('#select-view .level-btn')).toHaveCount(V4);
  await expect(page.locator('#lab-new-title')).toHaveText('New tiles: ice, mud, gates');
  await expect(page.locator('#select-view .lab-new-btn')).toHaveCount(levels.length);
  for (let i = 0; i < levels.length; i++) {
    await expect(page.getByRole('button', { name: `Lab ${V4 + i + 1}, not played` })).toBeVisible();
  }
  // the new heading sits below the v4 grid
  const a = await page.locator('#select-view .level-btn').last().boundingBox();
  const b = await page.locator('#lab-new-title').boundingBox();
  expect(b.y).toBeGreaterThan(a.y + a.height);
});

test('v5 lab levels draw ice, mud and gates with their labels', async ({ page }) => {
  const names = { '*': 'Ice', '&': 'Mud', '>': 'Gate, one way right', '<': 'Gate, one way left', '^': 'Gate, one way up', v: 'Gate, one way down' };
  const art = { '*': 'tile-ice.svg', '&': 'tile-mud.svg', '>': 'tile-gate-r.svg', '<': 'tile-gate-l.svg', '^': 'tile-gate-u.svg', v: 'tile-gate-d.svg' };
  const kinds = new Set();
  for (let k = 0; k < levels.length; k++) {
    const lv = levels[k];
    await openV5(page, k);
    await expect(page.locator('#board .cell')).toHaveCount(lv.size * lv.size);
    for (let y = 0; y < lv.size; y++) {
      for (let x = 0; x < lv.size; x++) {
        const ch = lv.tiles[y][x];
        if (!names[ch]) continue;
        kinds.add(ch);
        const cell = tile(page, x, y);
        await expect(cell).toHaveAttribute('aria-label', `${names[ch]}, row ${y + 1} column ${x + 1}`);
        await expect(cell).toHaveCSS('background-image', new RegExp(art[ch].replace('.', '\\.')));
      }
    }
  }
  expect([...kinds].sort()).toEqual(expect.arrayContaining(['*', '&']));
  expect([...kinds].some((c) => '<>^v'.includes(c))).toBe(true);
});

test('a fence beside ice, mud or a gate is named in its label like grass', async ({ page }) => {
  // lab5-01 ice at (0,2): its stored answer has the line below it
  const lv = levels[0];
  const w = lv.answer.find(([x, y, d]) => lv.tile(x, y) === '*' && d === 'D');
  expect(w, 'an answer fence under an ice tile').toBeTruthy();
  await openV5(page, 0);
  await press(page, w);
  await expect(tile(page, w[0], w[1])).toHaveAttribute('aria-label', `Ice, row ${w[1] + 1} column ${w[0] + 1}, wall on bottom`);
});

for (let k = 0; k < 7; k++) {
  test(`v5 lab level ${k + 1}: its stored answer wins with 3 stars`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const lv = levels[k];
    await openV5(page, k);
    await expect(page.locator('#par')).toHaveText(String(lv.par));
    for (const w of lv.answer) await press(page, w);
    await expect(page.locator('#board .wall-bar')).toHaveCount(lv.par);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win');
    await expect(result(page).getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS);
    expect(saved.best[lv.id]).toBe(3);
    // the last v5 level ends on "All lab levels", the others on "Next level"
    await expect(result(page).getByRole('button', { name: k === levels.length - 1 ? 'All lab levels' : 'Next level' })).toBeVisible();
  });
}

test('the last v4 lab level still ends on "All lab levels" (the v5 levels are a separate group)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const lv = parseLevel(labV4.levels[V4 - 1]);
  await page.goto(`/play/?lab=${V4}`);
  await expect(page.locator('#board .cell').first()).toBeVisible();
  for (const w of lv.answer) await press(page, w);
  await go(page).click();
  await expect(result(page).getByRole('button', { name: 'All lab levels' })).toBeVisible();
});

test('moves left ticks once per move: a whole slide is one, the stuck move in mud is one', async ({ page }) => {
  // an ice level whose answer slides, and a mud level whose answer gets stuck
  const iceK = levels.findIndex((lv) => hasSlide(simulate(lv, lv.answer)));
  const mudK = levels.findIndex((lv) => simulate(lv, lv.answer).stuck.length > 0);
  expect(iceK, 'a level whose answer includes a slide').toBeGreaterThanOrEqual(0);
  expect(mudK, 'a level whose answer includes a stuck move').toBeGreaterThanOrEqual(0);
  for (const k of [iceK, mudK]) {
    const lv = levels[k];
    const sim = simulate(lv, lv.answer);
    const moves = sim.steps.length - 1;
    await openV5(page, k);
    for (const w of lv.answer) await press(page, w);
    await watch(page);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win', { timeout: 30000 });
    const s = await seen(page);
    const expected = Array.from({ length: moves + 1 }, (_, i) => lv.moveLimit - i); // limit, limit - 1, ... limit - moves
    expect(s.moves, `${lv.id}: moves-left shows every move exactly once`).toEqual(expected);
    if (k === iceK) expect(s.robot, 'the gnome skids on a slide').toContain('skid');
    if (k === mudK) { expect(s.robot).toContain('sink'); expect(s.robot).toContain('wiggle'); }
  }
});

test('a replay through a gate opens it, and v4 levels never take the new animation classes', async ({ page }) => {
  const gateK = levels.findIndex((lv) => lv.id === 'lab5-06'); // a gate-only level whose no-fence route goes through a gate
  await openV5(page, gateK);
  await watch(page);
  await go(page).click(); // no fences: he walks home through the gate
  await expect(result(page)).toHaveAttribute('data-result', 'lose', { timeout: 30000 });
  expect((await seen(page)).cells).toContain('gate-open');
  await expect(page.locator('#board .cell.gate-open')).toHaveCount(0); // closed behind him, or by the end of the run

  // a v4 level: the gnome only ever walks
  await page.goto('/play/?level=1');
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await watch(page);
  await go(page).click();
  await expect(result(page)).toBeVisible({ timeout: 30000 });
  const s = await seen(page);
  for (const c of ['skid', 'bump', 'sink', 'wiggle', 'pull']) expect(s.robot).not.toContain(c);
});

test('reduced motion: no slide, wiggle or swing, the final frame at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const k of [0, 2, 6]) {
    const lv = levels[k];
    const sim = simulate(lv, lv.answer);
    await openV5(page, k);
    for (const w of lv.answer) await press(page, w);
    await watch(page);
    await go(page).click();
    await expect(result(page)).toHaveAttribute('data-result', 'win');
    const s = await seen(page);
    for (const c of ['skid', 'bump', 'sink', 'wiggle', 'pull']) expect(s.robot, `${lv.id} ${c}`).not.toContain(c);
    expect(s.cells).not.toContain('gate-open');
    await expect(movesLeft(page)).toHaveText(String(lv.moveLimit - (sim.steps.length - 1)));
    await expect(page.locator('#board .frost, #board .mud-bubble')).toHaveCount(0);
  }
});

test('no console errors and no sideways scroll on the lab tab and every v5 level', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', (r) => { if (r.url().startsWith('http://localhost:4173') && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.goto('/play/?lab');
  await expect(page.locator('.lab-new-btn').first()).toBeVisible();
  expect(await overflow(), 'lab tab scrolls sideways').toBeLessThanOrEqual(0);
  for (let k = 0; k < levels.length; k++) {
    await openV5(page, k);
    expect(await overflow(), `${levels[k].id} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  // one full animated run with the answer, on a level with a slide
  const iceK = levels.findIndex((lv) => hasSlide(simulate(lv, lv.answer)));
  await openV5(page, iceK);
  for (const w of levels[iceK].answer) await press(page, w);
  await go(page).click();
  await expect(result(page)).toHaveAttribute('data-result', 'win', { timeout: 30000 });
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(errors.filter((e) => !/fonts\.(googleapis|gstatic)/.test(e))).toEqual([]);
});

test('hints work on a v5 level and the placed wall is from the stored answer', async ({ page }) => {
  await openV5(page, 1);
  await page.locator('#hint-btn').click();
  const line = await page.locator('#board .wall-bar[data-hint="1"]').getAttribute('data-line');
  expect(levels[1].answer.map((w) => w.join(','))).toContain(line);
});
