import { test, expect } from '@playwright/test';
import { EMPLOYEE_STATE } from './state';
import { apiGet } from './api';

test.use({ storageState: EMPLOYEE_STATE });

/**
 * The employee's day, through the browser. What this catches that nothing else does is a
 * boundary mismatch — a route whose response shape the page does not read, or a form posting
 * something the route rejects. Both pass every unit and db test in the repository.
 */

test('the dashboard renders for a signed-in employee', async ({ page }) => {
  // Act
  await page.goto('/dashboard');

  // Assert
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Hello, Eve Employee/ })).toBeVisible();
});

test('clocking in is reflected on the page without a reload', async ({ page }) => {
  // Arrange
  await page.goto('/dashboard');
  const clockIn = page.getByRole('button', { name: /clock in/i });
  await expect(clockIn).toBeVisible();

  // Act
  await clockIn.click();

  // Assert: the day is now in progress, so leaving becomes the offered action.
  await expect(page.getByRole('button', { name: /clock out/i })).toBeVisible({ timeout: 15_000 });
});

test('the calendar page renders its grid', async ({ page }) => {
  // Act
  await page.goto('/calendar');

  // Assert
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page.locator('.rbc-calendar')).toBeVisible({ timeout: 15_000 });
});

test('an employee is not offered the admin pages', async ({ page }) => {
  // Act
  await page.goto('/dashboard');

  // Assert
  await expect(page.getByRole('link', { name: /approvals/i })).toHaveCount(0);
});

test('an employee is refused the admin API', async ({ page }) => {
  // Arrange
  await page.goto('/dashboard');

  // Act
  const res = await apiGet(page, '/api/admin/settings');

  // Assert
  expect(res.status).toBe(403);
});
