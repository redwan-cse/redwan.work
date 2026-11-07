import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
