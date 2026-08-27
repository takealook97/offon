import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a real build talking to a real database.
 *
 * The unit and db tests cover the rules; these cover the parts nothing else does — that the
 * pages render, that a form posts what the route expects, and that the result comes back on
 * screen. A boundary mismatch between a route and the component reading it passes every other
 * suite in this repository and fails here.
 *
 * Slack is never involved. The login code is written straight into the database by the seed,
 * so the real sign-in path is exercised without a DM.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/** Its own database, because the seed empties it. */
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://offon:offon@localhost:55432/offon_e2e?schema=public';

const env = {
  DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-session-secret-not-a-real-one',
  OTP_PEPPER: process.env.OTP_PEPPER ?? 'e2e-otp-pepper-not-a-real-one',
  CRON_SECRET: process.env.CRON_SECRET ?? 'e2e-cron-secret-not-a-real-one',
  // Deliberately absent: SLACK_BOT_TOKEN. Without it lib/slack.ts refuses to build a client,
  // so a run cannot message anyone even if a flow tries to.
  NEXT_PUBLIC_TIMEZONE: 'Asia/Seoul',
  DEFAULT_LOCALE: 'en',
  NODE_ENV: 'production',
};

export default defineConfig({
  testDir: './e2e',
  // The seed truncates, so one worker. These are cheap; the isolation is worth more.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Signs in through the real verify-code endpoint with the seeded code, and saves the
    // resulting cookie. Slack only ever carried the code; obtaining it another way is not a
    // bypass of the sign-in, and every guard below runs exactly as it does in production.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: 'node .next/standalone/server.js',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...env, PORT: String(PORT), HOSTNAME: '127.0.0.1' },
  },
});
