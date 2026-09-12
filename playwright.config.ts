import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, fullyParallel: false, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4311', headless: true, viewport: { width: 1440, height: 1000 }, launchOptions: { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'tsx tests/start-test-server.ts', url: 'http://127.0.0.1:4311/api/project', reuseExistingServer: false, timeout: 30000 },
});
