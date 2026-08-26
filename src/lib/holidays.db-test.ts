import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase } from '@/test/db';
import { listHolidays, getHolidaySet } from './holidays';

/**
 * Both of these interpolate their arguments into a date string and hand the result to Prisma.
 * A bound that is not a date therefore used to become an Invalid Date, which Prisma rejects at
 * the driver — so a mistyped query string came back as a 500 rather than as a bad request, and
 * on the routes that pass the bound straight through it took the whole page down with it.
 *
 * The convention here is the one getHolidaySet already had: a bound that is not a date is not
 * a bound. Refusing the request is the route's job; the data layer's job is never to build a
 * query it cannot run.
 */

before(() => ensureSchema());
beforeEach(async () => {
  await resetDatabase();
  await prisma.holiday.createMany({
    data: [
      { date: new Date('2026-01-01T00:00:00Z'), name: "New Year's Day" },
      { date: new Date('2026-03-01T00:00:00Z'), name: 'Independence Movement Day' },
      { date: new Date('2026-05-05T00:00:00Z'), name: "Children's Day" },
    ],
  });
});
after(() => prisma.$disconnect());

test('a valid range returns only the holidays inside it', async () => {
  // Act
  const rows = await listHolidays({ from: '2026-02-01', to: '2026-04-01' });

  // Assert
  assert.deepEqual(rows.map((r) => r.date), ['2026-03-01']);
});

test('no bounds at all returns everything, in date order', async () => {
  // Act
  const rows = await listHolidays();

  // Assert
  assert.deepEqual(rows.map((r) => r.date), ['2026-01-01', '2026-03-01', '2026-05-05']);
});

test('a bound that is not a date is dropped rather than crashing the query', async () => {
  // Act
  const rows = await listHolidays({ from: 'not-a-date', to: '2026-04-01' });

  // Assert: the good half of the range still applies.
  assert.deepEqual(rows.map((r) => r.date), ['2026-01-01', '2026-03-01']);
});

test('both bounds unusable falls back to the unfiltered list', async () => {
  // Act
  const rows = await listHolidays({ from: '2026-13-45', to: '</script>' });

  // Assert
  assert.equal(rows.length, 3);
});

test('a date-like string that is not a real day is refused as a bound', async () => {
  // Arrange: February 30th parses in some engines by rolling over. It is not a day.
  // Act
  const rows = await listHolidays({ from: '2026-02-30', to: '2026-02-30' });

  // Assert
  assert.equal(rows.length, 3, 'an impossible date must not silently become March 2nd');
});

test('getHolidaySet returns the days inside a valid range', async () => {
  // Act
  const set = await getHolidaySet('2026-01-01', '2026-03-01');

  // Assert
  assert.deepEqual([...set].sort(), ['2026-01-01', '2026-03-01']);
});

test('getHolidaySet returns nothing for a bound that is not a date', async () => {
  // Act
  const set = await getHolidaySet('garbage', '2026-12-31');

  // Assert
  assert.equal(set.size, 0);
});
