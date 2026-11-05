// Smoke test of the stamped site as the deploy would publish it: the home page, the daily page and the game load,
// every request to our own origin succeeds (a stamper regression shows up as a 404), and nothing throws.
import { test, expect } from '@playwright/test';

const pages = [
  { path: '/', ready: '#teaser .cell' },
  { path: '/daily/', ready: '#board .cell' },
  { path: '/play/', ready: 'h1' },
];

for (const { path, ready } of pages) {
  test(`stamped site: ${path} loads with no 404 and no page error`, async ({ page, baseURL }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('response', (r) => {
      if (r.url().startsWith(baseURL) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    page.on('requestfailed', (r) => {
      if (r.url().startsWith(baseURL)) errors.push(`failed ${r.url()}`);
    });
    const res = await page.goto(path);
    expect(res.status()).toBe(200);
    await expect(page.locator(ready).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

test('stamped site: own scripts and styles carry the version stamp', async ({ page, baseURL }) => {
  const own = [];
  page.on('request', (r) => {
    if (r.url().startsWith(baseURL) && /\.(js|css|json)(\?|$)/.test(r.url())) own.push(r.url());
  });
  await page.goto('/daily/');
  await expect(page.locator('#board .cell').first()).toBeVisible();
  expect(own.length).toBeGreaterThan(5);
  expect(own.filter((u) => !/\?v=[0-9a-f]+/.test(u))).toEqual([]);
});
