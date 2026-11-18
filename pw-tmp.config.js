import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', outputDir: '/tmp/claude-0/-home-user-invisible-maze/70fe2266-bc91-5256-9b1d-3aa420feb8dc/scratchpad/results', reporter: 'list',
  use: { baseURL: 'http://localhost:4193' },
  webServer: { command: 'python3 -m http.server 4193', url: 'http://localhost:4193', reuseExistingServer: false },
  projects: [{ name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } }, { name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
