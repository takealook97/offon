import { test as setup, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, EMPLOYEE, LOGIN_CODE } from './seed';
import { ADMIN_STATE, EMPLOYEE_STATE, localeCookie } from './state';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Signs both seeded people in and keeps their cookies for the rest of the suite.
 *
 * The real endpoint is used, with a real code, and everything it does runs — argon2
 * verification against the stored hash, the attempt counter, marking the code used, signing
 * the JWT, setting the cookie. The only step not exercised is Slack carrying the code to a
 * person, which no browser test could do anyway. Nothing here forges a session.
 *
 * A code is single use, which is why this runs once and the result is shared.
 */

async function signIn(request: APIRequestContext, email: string, statePath: string) {
  const res = await request.post('/api/auth/verify-code', {
    data: { email, code: LOGIN_CODE },
  });
  expect(res.status(), await res.text()).toBe(200);

  const { cookies } = await request.storageState();
  const session = cookies.find((c) => c.name === 'session');
  expect(session, 'the sign-in must set a session cookie').toBeTruthy();
  expect(session?.httpOnly, 'the session cookie must not be readable from script').toBe(true);

  await request.storageState({ path: statePath });

  // The saved state carries the display language too, so the suites do not depend on whatever
  // the default happens to be.
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.cookies.push(localeCookie());
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

setup('sign the admin in', async ({ request }) => {
  await signIn(request, ADMIN.email, ADMIN_STATE);
});

setup('sign the employee in', async ({ request }) => {
  await signIn(request, EMPLOYEE.email, EMPLOYEE_STATE);
});
