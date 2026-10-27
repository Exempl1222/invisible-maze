import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const hard = JSON.parse(readFileSync(new URL('../assets/levels/daily.json', import.meta.url), 'utf8'));
const KEY = 'gnome-sweet-gnome:daily:v2';
const NOON = (d) => new Date(`${d}T12:00:00+11:00`);
test.use({ reducedMotion: 'reduce', timezoneId: 'Australia/Sydney' });
const tile = (page, x, y) => page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
async function press(page, [x, y, dir]) {
  await tile(page, x, y).scrollIntoViewIfNeeded();
  const box = await tile(page, x, y).boundingBox();
  const f = { R: [0.88, 0.5], D: [0.5, 0.88], L: [0.12, 0.5], U: [0.5, 0.12] }[dir];
  await page.mouse.move(box.x + box.width * f[0], box.y + box.height * f[1]);
  await page.mouse.down(); await page.mouse.up();
}
async function placeAll(page, list) {
  await page.evaluate(() => document.fonts.ready);
  for (const w of list) {
    await press(page, w);
    await expect(page.locator(`#board .wall-bar[data-line="${w.join(',')}"]`)).toHaveCount(1);
  }
}
const ALL = [];
const dump = async (page, label) => {
  const d = await page.evaluate(() => ({ ...window.__debug(), ls: localStorage.getItem('gnome-sweet-gnome:daily:v2'), fontsStatus: document.fonts.status, dpr: window.devicePixelRatio, vw: innerWidth }));
  ALL.push(label + ' ' + JSON.stringify(d));
  console.log(`DBG ${label} ${JSON.stringify(d)}`);
  test.info().annotations.push({ type: 'dbg-' + label, description: JSON.stringify(d).slice(0, 3000) });
  return d;
};
test('repro', async ({ context }) => {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
  await page.addInitScript((key) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 2, easy: {}, hard: {}, lastMode: null, seenHowTo: true })); } catch {} }, KEY);
  await page.clock.install({ time: NOON('2026-10-30') });
  await page.goto('/daily/?mode=hard&date=2026-10-29');
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await placeAll(page, hard.levels[2].answer);
  await page.locator('#go').click();
  await page.clock.runFor(1000);
  await expect(page.locator('#board[aria-busy="false"], #result:not([hidden])').first()).toBeAttached();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('#result')).toHaveAttribute('data-state', 'done');
  await dump(page, 'archive-done');
  await page.goto('/daily/?mode=hard');
  await expect(page.locator('#board .cell').first()).toBeVisible();
  await dump(page, 'today-loaded');
  await placeAll(page, hard.levels[3].answer);
  const pre = await dump(page, 'pre-try');
  await page.locator('#go').click();
  await page.waitForTimeout(500);
  await dump(page, 'post-try-500ms');
  await page.clock.runFor(1000);
  await page.waitForTimeout(500);
  const post = await dump(page, 'post-runFor');
  throw new Error('DUMP\n' + ALL.map((a) => a.slice(0, 1500)).join('\n'));
});
