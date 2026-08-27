import { test, expect } from '@playwright/test';
import { EMPLOYEE } from './seed';
import { SIGNED_OUT } from './state';

/**
 * The guard, from the outside. Every other suite in this repository asserts that the rules are
 * right; this asserts that they are actually in front of the pages.
 */

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  test('the sign-in page renders its form', async ({ page }) => {
    // Act
    await page.goto('/login');

    // Assert
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /send me a code/i })).toBeVisible();
  });

  test('an app page redirects to sign-in instead of rendering', async ({ page }) => {
    // Act
    await page.goto('/dashboard');

    // Assert
    await expect(page).toHaveURL(/\/login/);
  });

  test('the calendar is behind the guard too', async ({ page }) => {
    // Act
    await page.goto('/calendar');

    // Assert
    await expect(page).toHaveURL(/\/login/);
  });

  test('an API route sends the guard, not data', async ({ request }) => {
    // Act: redirects are not followed, so what the guard itself answered is visible.
    const res = await request.get('/api/members', { maxRedirects: 0 });

    // Assert: the proxy turns it away before the handler runs.
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toContain('/login');
  });

  test('a wrong code is refused', async ({ request }) => {
    // Act
    const res = await request.post('/api/auth/verify-code', {
      data: { email: EMPLOYEE.email, code: '000000' },
    });

    // Assert
    expect(res.status()).toBe(401);
  });

  test('a malformed code never reaches the hasher', async ({ request }) => {
    // Act
    const res = await request.post('/api/auth/verify-code', {
      data: { email: EMPLOYEE.email, code: 'abc' },
    });

    // Assert
    expect(res.status()).toBe(400);
  });
});
