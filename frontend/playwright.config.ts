import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: require.resolve('./e2e/setup/global-setup'),
  globalTeardown: require.resolve('./e2e/setup/global-teardown'),
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'npm run start',
      port: 4200,
      reuseExistingServer: !process.env['CI'],
      cwd: '../frontend',
    },
    {
      command: 'TWITCH_CLIENT_ID=test_client_id TWITCH_CLIENT_SECRET=test_secret JWT_SECRET=test_jwt_secret MONGODB_URL=mongodb://localhost:27017/alias_test REDIS_URL=redis://localhost:6379 cargo run --bin api-gateway',
      port: 3000,
      reuseExistingServer: !process.env['CI'],
      cwd: '../backend',
    },
  ],
});