import type { Page } from '@playwright/test';

/**
 * Calls an API route from inside the page, the way the app's own client components do.
 *
 * Not through Playwright's `request` fixture, which is a Node-side client with its own cookie
 * jar. The session cookie is `Secure` in production, and that jar will not send a Secure
 * cookie over http — Chromium will, because it exempts localhost, but the Node client does
 * not. So `request` silently arrives signed out, the guard redirects it to the sign-in page,
 * and the assertion sees a 200 full of HTML.
 *
 * Going through the page avoids that and is closer to the truth anyway: this is the same
 * fetch, from the same origin, with the same cookies as the person using the app.
 */
export async function apiGet(
  page: Page,
  path: string,
): Promise<{ status: number; body: string }> {
  return page.evaluate(async (p) => {
    const res = await fetch(p, { headers: { accept: 'application/json' } });
    return { status: res.status, body: await res.text() };
  }, path);
}
