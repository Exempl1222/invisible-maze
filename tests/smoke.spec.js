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

test('teaser renders a 7x7 board with clues and moves the robot', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#teaser .cell')).toHaveCount(49);
  await expect(page.locator('#teaser .clue')).toHaveCount(14);
  const start = await page.locator('#teaser-distance').textContent();
  await expect(page.locator('#teaser-distance')).not.toHaveText(start, { timeout: 5000 });
  await expect(page.locator('#teaser .cell.wall').first()).toBeVisible({ timeout: 5000 });
});

test('nav links reach the play page and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Play', exact: true }).click();
  await expect(page).toHaveURL(/\/play\/$/);
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.locator('#teaser')).toBeVisible();
});
