import { seed } from './seed';

/**
 * Runs once before the suite. The web server Playwright starts reads the same database, so the
 * seed has to land before any test does.
 */
export default async function globalSetup(): Promise<void> {
  const url =
    process.env.E2E_DATABASE_URL ??
    'postgresql://offon:offon@localhost:55432/offon_e2e?schema=public';
  process.env.OTP_PEPPER ??= 'e2e-otp-pepper-not-a-real-one';
  await seed(url);
}
