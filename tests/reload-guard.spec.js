// The daily page's reload guard (assets/js/daily/reload-guard.js): when a module fails to load or link, which can happen
// in the minutes a deploy is mixed old and new files, the page reloads once, never in a loop.
// A 404 module fires `error` on its <script>; a module that imports a name its dependency does not export is a link error
// that only fires on window, so the guard also checks that main.js set window.__gsgBooted shortly after `load`.
import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Australia/Sydney' });

const DIALOGS = '**/assets/js/daily/dialogs.js*';
const JS = 'application/javascript';
const missingExport = (route) => route.fulfill({ status: 200, contentType: JS, body: 'export const somethingElse = 1;' });
const notFound = (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });

/** Counts loads of the daily document itself. */
function countLoads(page) {
  const loads = [];
  page.on('request', (r) => { if (r.isNavigationRequest() && new URL(r.url()).pathname === '/daily/') loads.push(r.url()); });
  return loads;
}
const board = (page) => page.locator('#board .cell').first();

for (const [name, broken] of [['a 404 module', notFound], ['a module that imports a missing export', missingExport]]) {
  test(`${name}: the page reloads once and recovers when the next load is good`, async ({ page }) => {
    const loads = countLoads(page);
    let first = true;
    await page.route(DIALOGS, (route) => {
      if (first) { first = false; return broken(route); }
      return route.continue();
    });
    await page.goto('/daily/?mode=easy');
    await expect(board(page)).toBeVisible({ timeout: 15000 });
    expect(loads.length).toBe(2);
  });

  test(`${name}: if it is still broken after the reload, the page stays as it is (no reload loop)`, async ({ page }) => {
    const loads = countLoads(page);
    await page.route(DIALOGS, broken);
    await page.goto('/daily/?mode=easy');
    await expect.poll(() => loads.length, { timeout: 15000 }).toBe(2);
    await page.waitForTimeout(5000); // well past the guard's wait: a loop would show as a third load
    expect(loads.length).toBe(2);
    await expect(page.locator('#loading')).toBeVisible(); // still on "Loading today's gnome..."
  });
}

test('a healthy page is never reloaded and sets the booted flag', async ({ page }) => {
  const loads = countLoads(page);
  await page.goto('/daily/?mode=easy');
  await expect(board(page)).toBeVisible();
  expect(await page.evaluate(() => window.__gsgBooted)).toBe(true);
  await page.waitForTimeout(3500);
  expect(loads.length).toBe(1);
});
