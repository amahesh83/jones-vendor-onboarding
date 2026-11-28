'use strict'
const { defineConfig } = require('@playwright/test')
process.env.NO_PROXY = [process.env.NO_PROXY, 'localhost', '127.0.0.1'].filter(Boolean).join(',')
module.exports = defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 90000,
  expect: { timeout: 12000 },
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4004', headless: true, browserName: process.env.PLAYWRIGHT_BROWSER || 'chromium',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    actionTimeout: 15000, navigationTimeout: 15000,
    launchOptions: process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
  },
  projects: [
    { name: 'journeys', testMatch: /journeys\.spec\.js/, use: { viewport: { width: 1280, height: 900 } } },
    ...[375, 1280].flatMap(width => ['light', 'dark'].map(colorScheme => ({
      name: `${width}-${colorScheme}`, testMatch: /screens\.spec\.js/,
      use: { viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' },
    }))),
  ],
  webServer: {
    command: 'npm run demo', url: 'http://127.0.0.1:4004/api/health',
    reuseExistingServer: process.env.VOB_REUSE_DEMO === '1', timeout: 120000,
    env: { PORT: '4004' },
  },
})
