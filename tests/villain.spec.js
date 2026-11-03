// Sir Croakwell (docs/VILLAIN_SPEC.md): the toad wizard under the board, the title and the how-to dialog.
// Daily answers come from the level files and are pressed into the real page, like daily.spec.js.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseLevel, buildableLines, capViolation, cutsAllRoutes } from '../src/game/index.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const easy = readJson('../assets/levels/daily-easy.json').levels[0]; // day 0 is 27 Oct 2026
const KEY = 'gnome-sweet-gnome:daily:v2';
const NOON = new Date('2026-10-27T12:00:00+11:00');

test.use({ reducedMotion: 'reduce', timezoneId: 'Australia/Sydney' });

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const pose = (page) => page.locator('#villain .sprite');
async function pressAt(page, x, y, [fx, fy]) {
  await tile(page, x, y).scrollIntoViewIfNeeded();
  const box = await tile(page, x, y).boundingBox();
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  await page.mouse.down();
  await page.mouse.up();
}
const FRAC = { R: [0.88, 0.5], D: [0.5, 0.88], L: [0.12, 0.5], U: [0.5, 0.12] };
const press = (page, [x, y, dir]) => pressAt(page, x, y, FRAC[dir]);

async function openDaily(page) {
  await page.addInitScript((key) => {
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 2, easy: {}, hard: {}, lastMode: null, seenHowTo: true })); } catch { /* storage blocked */ }
  }, KEY);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: NOON });
  await page.goto('/daily/?mode=easy');
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-idle');
}
const settle = (page) => expect(page.locator('#board[aria-busy="false"], #result:not([hidden])').first()).toBeAttached();
async function tryNow(page) {
  await page.locator('#go').click();
  await page.clock.runFor(8000);
  await settle(page);
}

test('daily: Sir Croakwell stands under the board with his idle sprite, and never blocks a tap', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openDaily(page);
  const villain = page.locator('#villain');
  await expect(villain).toHaveAttribute('aria-hidden', 'true');
  await expect(villain.locator('svg')).toHaveCount(1);
  await expect(villain).toHaveCSS('pointer-events', 'none');
  // He sits right under the board and his hands overlap its bottom edge a little.
  const [b, v] = await Promise.all([page.locator('#board').boundingBox(), villain.boundingBox()]);
  expect(v.y).toBeLessThan(b.y + b.height);
  expect(v.y).toBeGreaterThan(b.y + b.height - 30);
  expect(v.width).toBeCloseTo(b.width, 0);
  expect(errors).toEqual([]);
});

test('daily: a fence on a bottom-row line under one of his hands is still tappable', async ({ page }) => {
  await openDaily(page);
  const lv = parseLevel({ ...easy, wallBudget: 999 });
  const last = lv.size - 1;
  const lines = buildableLines(lv).filter((l) => l[1] === last && l[2] === 'R' && capViolation(lv, [l]) === null && !cutsAllRoutes(lv, [l]));
  expect(lines.length).toBeGreaterThan(0);
  // Where his hands are: measured from the hand groups themselves (they grip the board's bottom corners).
  const v = await page.locator('#villain').boundingBox();
  const hands = [];
  for (const h of await page.locator('#villain .toad-hand').all()) { const hb = await h.boundingBox(); hands.push(hb.x + hb.width / 2); }
  expect(hands).toHaveLength(2);
  const pressX = async (l) => { const b = await tile(page, l[0], l[1]).boundingBox(); return b.x + b.width * 0.99; };
  let best = null;
  for (const l of lines) {
    const x = await pressX(l);
    const dist = Math.min(...hands.map((h) => Math.abs(h - x)));
    if (!best || dist < best.dist) best = { l, dist };
  }
  const tileBox = await tile(page, best.l[0], best.l[1]).boundingBox();
  expect(best.dist).toBeLessThan(tileBox.width); // a line in the column under a hand
  const point = { x: tileBox.x + tileBox.width * 0.99, y: tileBox.y + tileBox.height * 0.96 }; // the very bottom of the tile: inside the overlap
  expect(point.y).toBeGreaterThan(v.y); // the toad's box covers this point...
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('#villain') !== null, point);
  expect(hit).toBe(false); // ...but he is not the element under the finger
  await pressAt(page, best.l[0], best.l[1], [0.99, 0.96]);
  await expect(page.locator(`#board .wall-bar[data-line="${best.l.join(',')}"]`)).toHaveCount(1);
});

test('daily: placing a fence casts (spell sprite and magic on the new fence), then he is idle again', async ({ page }) => {
  await openDaily(page);
  await press(page, easy.answer[0]);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-cast');
  await expect(page.locator('#board .wall-bar.magic')).toHaveCount(1);
  await expect(page.locator('#board .wall-bar.magic .magic-fx .bit')).toHaveCount(4);
  await page.clock.runFor(700);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-idle');
  await expect(page.locator('#board .wall-bar.magic')).toHaveCount(0);
  // Taking the fence back is not a spell.
  await press(page, easy.answer[0]);
  await expect(page.locator('#board .wall-bar')).toHaveCount(0);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-idle');
});

test('daily: a second cast restarts the timer', async ({ page }) => {
  await openDaily(page);
  await press(page, easy.answer[0]);
  await page.clock.runFor(400);
  await press(page, easy.answer[1]);
  await page.clock.runFor(400); // 800ms since the first, 400ms since the second
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-cast');
  await page.clock.runFor(300);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-idle');
});

test('daily: the hint fence casts too, and restored fences after a reload do not', async ({ page }) => {
  await openDaily(page);
  await page.locator('#hint-btn').click();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-cast');
  await expect(page.locator('#board .wall-bar.magic')).toHaveCount(1);
  await page.clock.runFor(700);
  await page.reload();
  await expect(page.locator('#board .wall-bar')).toHaveCount(1); // the hint fence came back
  await expect(page.locator('#board .wall-bar.magic')).toHaveCount(0);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-idle');
});

test('daily: trapping the gnome makes him gloat, and the win screen comes back as a gloat on reload', async ({ page }) => {
  await openDaily(page);
  for (const w of easy.answer) await press(page, w);
  await page.clock.runFor(700);
  await tryNow(page);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-gloat');
  await page.reload(); // a win on the choice screen comes back as a gloat
  await expect(page.locator('#result')).toBeVisible();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-gloat');
});

test('daily: the gnome getting home makes him sulk until the player builds again', async ({ page }) => {
  await openDaily(page);
  await tryNow(page); // no fences: he walks home
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-sulk');
  await press(page, easy.answer[0]);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-cast');
  await page.clock.runFor(700);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-idle');
});

test('daily: five losses finish the day with a sulk, also after a reload', async ({ page }) => {
  await openDaily(page);
  for (let i = 0; i < 5; i++) await tryNow(page); // five losses
  await expect(page.locator('#result[data-state="done"]')).toBeVisible();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-sulk');
  await page.reload();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-sulk');
});

test('daily: a finished winning day comes back as a gloat on reload', async ({ page }) => {
  await openDaily(page);
  for (const w of easy.answer) await press(page, w);
  await tryNow(page);
  await page.locator('#submit-btn').click();
  await expect(page.locator('#result[data-state="done"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('#result[data-state="done"]')).toBeVisible();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-gloat');
});

test('daily: How to play opens with Sir Croakwell pointing and the new button text', async ({ page }) => {
  await openDaily(page);
  await page.locator('#help-btn').click();
  const dlg = page.locator('#howto-dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('[data-sprite="toad-front-point"] svg')).toBeVisible();
  await expect(dlg).toContainText('Ahem. Listen up, apprentice.');
  await expect(dlg.locator('ol.howto li')).toHaveCount(4);
  await expect(dlg.getByRole('button', { name: "Let's trap him" })).toBeVisible();
});

test('home: Sir Croakwell and his bubble, Easy and Hard links to the daily, and a Daily nav link', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.toad-stage img[src$="toad-front-smug.svg"]')).toBeVisible();
  await expect(page.locator('.toad-stage .bubble')).toHaveText("He'll never make it home.");
  const hero = page.locator('.hero-actions');
  await expect(hero.getByRole('link', { name: /Easy/ })).toHaveAttribute('href', 'daily/?mode=easy');
  await expect(hero.getByRole('link', { name: /Hard/ })).toHaveAttribute('href', 'daily/?mode=hard');
  await expect(hero.getByRole('link', { name: 'See how it plays' })).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Play', exact: true })).toHaveAttribute('href', 'play/');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Daily' })).toHaveAttribute('href', 'daily/');
  // The teaser board sits below the toad on a phone (and beside it on desktop).
  const [t, b] = await Promise.all([page.locator('.toad-stage').boundingBox(), page.locator('#teaser').boundingBox()]);
  if (page.viewportSize().width < 860) expect(b.y).toBeGreaterThan(t.y + t.height);
  else expect(b.x).toBeGreaterThan(t.x + t.width * 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('home: the Easy button reaches the daily on Easy', async ({ page }) => {
  await page.goto('/');
  await page.locator('.hero-actions').getByRole('link', { name: /Easy/ }).click();
  await expect(page).toHaveURL(/\/daily\/\?mode=easy$/);
});

test('play: the nav has a Daily link and the Daily tab points at the daily page', async ({ page }) => {
  await page.goto('/play/');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Daily' })).toHaveAttribute('href', '../daily/');
  await expect(page.getByRole('navigation', { name: 'Mode' }).getByRole('link', { name: 'Daily' })).toHaveAttribute('href', '../daily/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('play: Sir Croakwell casts on a placed wall, gloats on a win and sulks on a loss', async ({ page }) => {
  const pack = readJson('../assets/levels/pack-01.json');
  const raw = pack.levels[0];
  await page.goto('/play/?level=1');
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-idle');
  // A loss first: no walls, press Go.
  await page.locator('#go').click();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-sulk');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-idle');
  for (const w of raw.answer) await press(page, w);
  await expect(pose(page)).toHaveAttribute('data-sprite', /toad-back-(cast|idle)/);
  await page.locator('#go').click();
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-gloat');
});

test('layout: on a 390x844 phone he frames the board full width and the board is its old size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDaily(page);
  const [b, v] = await Promise.all([page.locator('#board').boundingBox(), page.locator('#villain').boundingBox()]);
  expect(b.width).toBe(358); // the board size on base 549a1a2 at this viewport
  expect(v.height).toBeGreaterThanOrEqual(120);
  expect(Math.abs(v.width - b.width)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('layout: on a 1366x768 desktop window he is fully visible and as wide as the board', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openDaily(page);
  const [b, v] = await Promise.all([page.locator('#board').boundingBox(), page.locator('#villain').boundingBox()]);
  expect(v.y + v.height).toBeLessThanOrEqual(768);
  expect(Math.abs(v.width - b.width)).toBeLessThanOrEqual(2);
});

for (const [w, h] of [[390, 844], [1366, 768]]) {
  test(`layout: his hands grip the board's outer 15% on each side at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openDaily(page);
    const b = await page.locator('#board').boundingBox();
    const hands = await page.locator('#villain .toad-hand').all();
    expect(hands).toHaveLength(2);
    const [l, r] = await Promise.all(hands.map((x) => x.boundingBox()));
    expect(l.x).toBeGreaterThanOrEqual(b.x - 1);
    expect(l.x + l.width).toBeLessThanOrEqual(b.x + b.width * 0.15);
    expect(r.x).toBeGreaterThanOrEqual(b.x + b.width * 0.85);
    expect(r.x + r.width).toBeLessThanOrEqual(b.x + b.width + 1);
  });
}

test('layout: the gnome walks over his hands, not under them', async ({ page }) => {
  await openDaily(page);
  const z = await page.evaluate(() => ({
    robot: +getComputedStyle(document.querySelector('#board .robot')).zIndex,
    villain: +getComputedStyle(document.querySelector('#villain')).zIndex,
  }));
  expect(z.robot).toBeGreaterThan(z.villain);
});

test('layout: no horizontal scroll at 375px on the home and play pages, and Easy and Hard sit above the fold at 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ['/', '/play/']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const b of await page.locator('.hero-actions .btn.big').all()) {
    const box = await b.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  }
});

test('layout: on a finished day at 1280x800 he sits directly under the board, whatever the side panel height', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDaily(page);
  for (const w of easy.answer) await press(page, w);
  await tryNow(page);
  await page.locator('#submit-btn').click();
  await expect(page.locator('#result[data-state="done"]')).toBeVisible();
  const [b, v] = await Promise.all([page.locator('#board').boundingBox(), page.locator('#villain').boundingBox()]);
  const overlap = v.height * 0.18; // the grid gap is cancelled by his negative margin, leaving 18% of his height
  expect(Math.abs((b.y + b.height - v.y) - overlap)).toBeLessThanOrEqual(3);
});
