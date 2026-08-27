import { test, expect } from '@playwright/test';
import { ADMIN_STATE } from './state';
import { apiGet } from './api';

test.use({ storageState: ADMIN_STATE });

/**
 * The admin side. The point of these is the role boundary: the same pages an employee is
 * refused must actually render for an admin, or the guard is simply broken in both directions.
 */

test('the approvals page renders for an admin', async ({ page }) => {
  // Act
  await page.goto('/admin/approvals');

  // Assert
  await expect(page).toHaveURL(/\/admin\/approvals/);
});

test('the settings page renders for an admin', async ({ page }) => {
  // Act
  await page.goto('/admin/settings');

  // Assert
  await expect(page).toHaveURL(/\/admin\/settings/);
});

test('the members page lists the seeded people', async ({ page }) => {
  // Act
  await page.goto('/admin/members');

  // Assert
  await expect(page.getByRole('cell', { name: 'Eve Employee' })).toBeVisible({ timeout: 15_000 });
});

test('the admin API answers an admin', async ({ page }) => {
  // Arrange
  await page.goto('/admin/settings');

  // Act
  const res = await apiGet(page, '/api/admin/settings');

  // Assert
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body).ok).toBe(true);
});

test('an unusable holiday range is a bad request, not a server error', async ({ page }) => {
  // Arrange
  await page.goto('/admin/settings');

  // Act
  const res = await apiGet(page, '/api/holidays?from=not-a-date&to=2026-12-31');

  // Assert: this used to reach Prisma as an Invalid Date and come back as a 500.
  expect(res.status).toBe(400);
});
