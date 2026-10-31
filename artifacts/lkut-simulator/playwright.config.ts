import { defineConfig, devices } from '@playwright/test';

// Use the running artifact through the shared proxy. A full URL also supports
// testing a mounted preview, e.g. https://example.test/apps/lkut/.
const baseURL = process.env.LKUT_BROWSER_BASE_URL || 'http://localhost:80/';

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../generated-artifacts/lkut-browser',
  fullyParallel: false,
  workers: 1, // The OS clipboard is shared, even between browser contexts.
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: baseURL.endsWith('/') ? baseURL : `${baseURL}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: {
        // Optional for environments with a managed Chromium installation.
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      },
    },
  }],
});
