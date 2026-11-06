// Design review fixes (Nov 2026): Croakwell's hat stays off the board, header links are big enough to tap,
// How to play opens at its title, and Try fits on a short laptop window.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { withAnswer } from './answers.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const easy = withAnswer(readJson('../assets/levels/daily-easy.json').levels[0]); // day 0 is 27 Oct 2026
const KEY = 'gnome-sweet-gnome:daily:v2';
const NOON = new Date('2026-10-27T12:00:00+11:00');

test.use({ reducedMotion: 'reduce', timezoneId: 'Australia/Sydney' });

const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
const pose = (page) => page.locator('#villain .sprite');
const FRAC = { R: [0.88, 0.5], D: [0.5, 0.88], L: [0.12, 0.5], U: [0.5, 0.12] };
async function press(page, [x, y, dir]) {
  await tile(page, x, y).scrollIntoViewIfNeeded();
  const box = await tile(page, x, y).boundingBox();
  await page.mouse.move(box.x + box.width * FRAC[dir][0], box.y + box.height * FRAC[dir][1]);
  await page.mouse.down();
  await page.mouse.up();
}
async function openDaily(page, { seen = true } = {}) {
  await page.addInitScript(([key, seenHowTo]) => {
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 2, easy: {}, hard: {}, lastMode: null, seenHowTo })); } catch { /* storage blocked */ }
  }, [KEY, seen]);
  await page.clock.install({ time: NOON });
  await page.goto('/daily/?mode=easy');
  await expect(page.locator('#board .cell').first()).toBeVisible();
}

/** Every point on a board tile where the toad's hat is painted on top of it (real hit testing, not bounding boxes). */
// He is pointer-events: none (taps go through him), and hit testing skips such elements, so switch that off while measuring.
const hatOverTiles = (page) => page.evaluate(() => {
  const probe = document.createElement('style');
  probe.textContent = '#villain, #villain * { pointer-events: auto !important; }';
  document.head.append(probe);
  const hits = [];
  for (const cell of document.querySelectorAll('#board .cell')) {
    const r = cell.getBoundingClientRect();
    for (let fx = 0.05; fx < 1; fx += 0.1) for (let fy = 0.05; fy < 1; fy += 0.1) {
      const stack = document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      const under = stack.findIndex((el) => el === cell || cell.contains(el));
      if (stack.slice(0, under).some((el) => el.closest('#villain .toad-hat'))) hits.push(cell.getAttribute('aria-label'));
    }
  }
  probe.remove();
  return [...new Set(hits)];
});

test('the hat is cocked over his eye and never covers a tile, idle or gloating', async ({ page }) => {
  await openDaily(page);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-idle');
  await expect(page.locator('#villain .toad-hat')).toHaveCount(1);
  expect(await hatOverTiles(page)).toEqual([]);
  for (const w of easy.answer) await press(page, w);
  await page.clock.runFor(700);
  await page.locator('#go').click();
  await page.clock.runFor(8000);
  await expect(pose(page)).toHaveAttribute('data-sprite', 'toad-back-gloat');
  expect(await hatOverTiles(page)).toEqual([]);
});

test('header links are at least 44px wide and tall on the home and play pages', async ({ page }) => {
  for (const path of ['/', '/play/']) {
    await page.goto(path);
    for (const a of await page.locator('.site-nav a').all()) {
      const box = await a.boundingBox();
      expect(box.width, `${path} ${await a.textContent()}`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${path} ${await a.textContent()}`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('How to play opens at its title with the title focused, even on a 1280x585 window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 585 });
  await openDaily(page, { seen: false });
  const dlg = page.locator('#howto-dlg');
  await expect(dlg).toBeVisible();
  await expect(page.locator('#howto-title')).toBeFocused();
  expect(await dlg.evaluate((d) => d.scrollTop)).toBe(0);
  const [title, box] = await Promise.all([page.locator('#howto-title').boundingBox(), dlg.boundingBox()]);
  expect(title.y).toBeGreaterThanOrEqual(box.y);
});

test('Try is above the fold on a 1280x585 window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 585 });
  await openDaily(page);
  const go = await page.locator('#go').boundingBox();
  expect(go.y + go.height).toBeLessThanOrEqual(585);
});
