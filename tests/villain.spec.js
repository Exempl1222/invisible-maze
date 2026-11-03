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

test('daily: a fence on a bottom-row line, right under his hands, is still tappable', async ({ page }) => {
  await openDaily(page);
  const lv = parseLevel({ ...easy, wallBudget: 999 });
  const last = lv.size - 1;
  const line = buildableLines(lv).find((l) => l[1] === last && l[2] === 'R' && capViolation(lv, [l]) === null && !cutsAllRoutes(lv, [l]));
  expect(line).toBeTruthy();
  const box = await tile(page, line[0], line[1]).boundingBox();
  const point = { x: box.x + box.width * 0.97, y: box.y + box.height * 0.88 }; // low on the tile: inside the overlap
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('#villain') !== null, point);
  expect(hit).toBe(false); // the toad is not the element under the finger
  await pressAt(page, line[0], line[1], [0.97, 0.88]);
  await expect(page.locator(`#board .wall-bar[data-line="${line.join(',')}"]`)).toHaveCount(1);
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

test('daily: three losses finish the day with a sulk, also after a reload', async ({ page }) => {
  await openDaily(page);
  for (let i = 0; i < 3; i++) await tryNow(page); // three losses
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
