import test from 'node:test';
import assert from 'node:assert/strict';
import { recomputeLeaveDays } from './leave';

// 2026-08-24 Monday to 08-28 Friday, with the 29th a Saturday and the 30th a Sunday.
const MON = '2026-08-24';
const WED = '2026-08-26';
const FRI = '2026-08-28';
const SAT = '2026-08-29';
const none = new Set<string>();

test('a full week of leave counts five days', () => {
  assert.equal(recomputeLeaveDays('FULL_DAY', MON, FRI, none), 5);
});

test('a holiday inside the range is not spent', () => {
  // If the Wednesday becomes a holiday after the request, the person did not spend leave on it, so only four days come out.
  assert.equal(recomputeLeaveDays('FULL_DAY', MON, FRI, new Set([WED])), 4);
});

test('weekends were never counted, so a holiday on one changes nothing', () => {
  assert.equal(recomputeLeaveDays('FULL_DAY', MON, SAT, new Set([SAT])), 5);
});

test('a week that turns out to be entirely holidays counts zero', () => {
  // A zero is the signal the caller reads as nothing to approve, and suggests rejecting instead.
  const week = new Set([MON, '2026-08-25', WED, '2026-08-27', FRI]);
  assert.equal(recomputeLeaveDays('FULL_DAY', MON, FRI, week), 0);
});

test('a half day is half a day regardless of range length', () => {
  assert.equal(recomputeLeaveDays('HALF_DAY_AM', MON, MON, none), 0.5);
  assert.equal(recomputeLeaveDays('HALF_DAY_PM', MON, MON, none), 0.5);
});

test('a half day on a newly declared holiday counts zero', () => {
  assert.equal(recomputeLeaveDays('HALF_DAY_AM', MON, MON, new Set([MON])), 0);
  assert.equal(recomputeLeaveDays('HALF_DAY_PM', MON, MON, new Set([MON])), 0);
});

test('a half day looks at its own date, not the end of the range', () => {
  // A half day covers one date, but the stored endDate may differ. The start date is what decides.
  assert.equal(recomputeLeaveDays('HALF_DAY_AM', MON, FRI, new Set([FRI])), 0.5);
  assert.equal(recomputeLeaveDays('HALF_DAY_AM', MON, FRI, new Set([MON])), 0);
});

test('a single weekend day of full-day leave counts zero', () => {
  assert.equal(recomputeLeaveDays('FULL_DAY', SAT, SAT, none), 0);
});
