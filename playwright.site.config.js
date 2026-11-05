// Smoke test of the collected, stamped site (CI only: .github/workflows/deploy.yml, test job).
//   tools/collect-site.sh _smoke_site "$GITHUB_SHA" && SITE_DIR=_smoke_site npx playwright test -c playwright.site.config.js
// SITE_DIR is the folder to serve (default _smoke_site). It is served on its own port, apart from the e2e server.
import { defineConfig, devices } from '@playwright/test';

const dir = process.env.SITE_DIR || '_smoke_site';
const port = 4174;

export default defineConfig({
  testDir: './tests-site',
  outputDir: './test-results-site',
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `python3 -m http.server ${port} --directory ${dir}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } }],
});
