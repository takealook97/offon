import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase } from '@/test/db';
import {
  type AppSettings,
  getAppSettings,
  updateAppSettings,
  roomHours,
  workHours,
} from './settings';
import { DEFAULT_WORK_HOURS } from './work-hours';

/**
 * These are the numbers the whole organisation is measured against: change the working window
 * and every standard day, half day and overtime figure moves with it. Two things matter here.
 *
 * One is that reading never writes. It used to upsert the row, so two people starting a meal
 * at the same moment both tried to create id=1 and one of them got a 500.
 *
 * The other is that the fallback used when no row exists is the same as the column defaults.
 * If those two drift, a fresh deployment computes different hours than it does after the
 * first visit to the settings screen — and nobody would think to look here for the cause.
 */

before(() => ensureSchema());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test('with no row stored, the defaults are used', async () => {
  // Act
  const s = await getAppSettings();

  // Assert
  assert.equal(s.missingClockInNotifyEnabled, false);
  assert.equal(s.missingClockOutNotifyEnabled, false);
  assert.equal(s.roomOpenMinutes, 8 * 60);
  assert.equal(s.roomCloseMinutes, 19 * 60);
  assert.equal(s.mealMinutes, DEFAULT_WORK_HOURS.mealMinutes);
  assert.equal(s.workStartMinutes, DEFAULT_WORK_HOURS.workStartMinutes);
  assert.equal(s.workEndMinutes, DEFAULT_WORK_HOURS.workEndMinutes);
});

test('the fallback matches what the columns default to', async () => {
  // Arrange: a row created with no values takes the schema defaults.
  const fallback = await getAppSettings();
  await prisma.appSetting.create({ data: { id: 1 } });

  // Act
  const stored = await getAppSettings();

  // Assert: everything but the timestamp, which only the stored row has.
  const withoutTimestamp = (s: AppSettings) => ({ ...s, updatedAt: null });
  assert.deepEqual(withoutTimestamp(stored), withoutTimestamp(fallback));
});

test('reading does not create the row', async () => {
  // Act
  await getAppSettings();
  await getAppSettings();

  // Assert
  assert.equal(await prisma.appSetting.count(), 0);
});

test('the first save creates the row, and a later one updates it', async () => {
  // Act
  const created = await updateAppSettings({ mealMinutes: 45 });
  const updated = await updateAppSettings({ mealMinutes: 90 });

  // Assert
  assert.equal(created.mealMinutes, 45);
  assert.equal(updated.mealMinutes, 90);
  assert.equal(await prisma.appSetting.count(), 1, 'there is only ever one settings row');
});

test('a partial save leaves the fields it did not mention alone', async () => {
  // Arrange
  await updateAppSettings({ workStartMinutes: 9 * 60, workEndMinutes: 18 * 60, mealMinutes: 60 });

  // Act
  const after = await updateAppSettings({ missingClockInNotifyEnabled: true });

  // Assert
  assert.equal(after.missingClockInNotifyEnabled, true);
  assert.equal(after.workStartMinutes, 9 * 60);
  assert.equal(after.workEndMinutes, 18 * 60);
  assert.equal(after.mealMinutes, 60);
});

test('roomHours reads back what was saved', async () => {
  // Arrange
  await updateAppSettings({ roomOpenMinutes: 7 * 60, roomCloseMinutes: 22 * 60 });

  // Act
  const hours = await roomHours();

  // Assert
  assert.deepEqual(hours, { openMinutes: 7 * 60, closeMinutes: 22 * 60 });
});

test('workHours is shaped to drop straight into the derivations', async () => {
  // Arrange
  await updateAppSettings({
    workStartMinutes: 10 * 60,
    workEndMinutes: 19 * 60,
    mealMinutes: 30,
  });

  // Act
  const hours = await workHours();

  // Assert: exactly the three keys work-hours.ts expects, and nothing else.
  assert.deepEqual(hours, {
    workStartMinutes: 10 * 60,
    workEndMinutes: 19 * 60,
    mealMinutes: 30,
  });
});

test('with no row stored, workHours still yields the defaults', async () => {
  // Act
  const hours = await workHours();

  // Assert
  assert.deepEqual(hours, DEFAULT_WORK_HOURS);
});
