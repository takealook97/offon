import type { Cookie } from '@playwright/test';

/**
 * Where the signed-in cookies from `auth.setup.ts` are kept, and the display language the
 * assertions are written against.
 *
 * Their own module because Playwright refuses to let one test file import another, and both
 * the setup that writes these and the suites that read them need the same values.
 */
export const ADMIN_STATE = 'e2e/.auth/admin.json';
export const EMPLOYEE_STATE = 'e2e/.auth/employee.json';

/**
 * The UI language is a per-person cookie that defaults to Korean, so every context sets it
 * explicitly. Otherwise these tests would assert against whichever language the default
 * happened to be, and changing that default would break them for no real reason.
 */
export function localeCookie(host = '127.0.0.1'): Cookie {
  return {
    name: 'locale',
    value: 'en',
    domain: host,
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  };
}

/** A context with no session, but still in English. */
export const SIGNED_OUT = { cookies: [localeCookie()], origins: [] };
