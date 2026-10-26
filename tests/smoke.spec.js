// Smoke tests: the site loads, nothing errors, nothing scrolls sideways on a
// phone, and the teaser actually plays. These gate every deploy.
import { test, expect } from '@playwright/test';

const pages = ['/', '/play/'];

for (const path of pages) {
  test(`${path} loads cleanly`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      // "Failed to load resource" is reported below with its URL instead.
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
    });
    // Any broken file on our own site fails the test.
    page.on('response', (r) => {
      if (r.url().startsWith('http://localhost:4173') && r.status() >= 400) {
        errors.push(`${r.status()} ${r.url()}`);
      }
    });

    const res = await page.goto(path);
    expect(res.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);

    // Font loading can fail offline in CI sandboxes; ignore only that.
    expect(errors.filter((e) => !/fonts\.(googleapis|gstatic)/.test(e))).toEqual([]);
  });
}

test('teaser renders the 9x9 level and plays both acts', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#teaser .cell')).toHaveCount(81);
  await expect(page.locator('#teaser .cell.teleporter')).toHaveCount(4);
  await expect(page.locator('#teaser .cell.beacon')).toHaveCount(1);
  await expect(page.locator('#teaser .cell.start')).toHaveCount(1);
  // Act 1: the robot moves and uses up moves.
  // Each value only shows for ~0.4s, so check the count has dropped, not an exact number.
  await expect(page.locator('#teaser-moves')).not.toHaveText('14', { timeout: 5000 });
  await expect(page.locator('#teaser .cell.beacon.reached')).toHaveCount(1, { timeout: 10000 });
  // Act 2: exactly the three par walls go down, as bars on the lines between tiles.
  await expect(page.locator('#teaser .wall-bar')).toHaveCount(3, { timeout: 12000 });
});

test('nav links reach the play page and back', async ({ page }) => {
  await page.goto('/');
  // The hero button is also called Play, so use the nav one.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Play' }).click();
  await expect(page).toHaveURL(/\/play\/$/);
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.locator('#teaser')).toBeVisible();
});
