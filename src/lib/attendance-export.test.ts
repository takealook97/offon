import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMonthRange } from './attendance-export';

/**
 * This gates the whole export: it decides which days end up in the spreadsheet handed to an
 * accountant. Every interesting case is a boundary, and every one of them is off by a day if
 * it is wrong — a month that stops a day early, or one that counts a day still in progress.
 *
 * `now` is always passed in, so none of these depend on when they run. The zone is the
 * default Asia/Seoul, so a `now` near midnight UTC is deliberately a different day locally.
 */

const at = (iso: string) => new Date(iso);

test('a past month runs from the first to the last day', () => {
  // Act
  const r = resolveMonthRange(2026, 6, at('2026-08-15T03:00:00Z'));

  // Assert
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.startKey, '2026-06-01');
  assert.equal(r.endKey, '2026-06-30');
  assert.equal(r.dayKeys.length, 30);
  assert.equal(r.yyyymm, '202606');
});

test('the current month stops at yesterday, because today is still in progress', () => {
  // Act
  const r = resolveMonthRange(2026, 8, at('2026-08-15T03:00:00Z'));

  // Assert
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.endKey, '2026-08-14');
  assert.equal(r.dayKeys.at(-1), '2026-08-14');
});

test('on the first of a month, the previous month is still whole', () => {
  // Arrange: the boundary where "yesterday" belongs to the month before.
  // Act
  const r = resolveMonthRange(2026, 7, at('2026-08-01T03:00:00Z'));

  // Assert
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.endKey, '2026-07-31', 'a finished month is not truncated by yesterday');
});

test('on the first of a month, that month has nothing in it yet', () => {
  // Act
  const r = resolveMonthRange(2026, 8, at('2026-08-01T03:00:00Z'));

  // Assert: yesterday is in July, so the August range is empty rather than negative.
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.dayKeys, []);
});

test('February is read from the calendar, not assumed', () => {
  // Arrange: 2026 is skipped because February predates the feature start.
  // Act
  const common = resolveMonthRange(2027, 2, at('2027-08-15T03:00:00Z'));
  const leap = resolveMonthRange(2028, 2, at('2028-08-15T03:00:00Z'));

  // Assert
  assert.equal(common.ok && common.endKey, '2027-02-28');
  assert.equal(leap.ok && leap.endKey, '2028-02-29');
});

test('a month is bounded by the org timezone, not by UTC', () => {
  // Arrange: 2026-08-01T14:00Z is already the 1st at 23:00 in Seoul, so yesterday is July 31.
  // Read as UTC it would still be August 1st, and yesterday would be July 31 as well — so the
  // case that separates them is just after UTC midnight, where Seoul is a day ahead.
  // Act: 2026-08-01T22:00Z is 2026-08-02 07:00 in Seoul, making yesterday August 1st.
  const r = resolveMonthRange(2026, 8, at('2026-08-01T22:00:00Z'));

  // Assert
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.dayKeys, ['2026-08-01'], 'the day rolled over in Seoul, not in UTC');
});

test('a month in the future is refused', () => {
  // Act
  const r = resolveMonthRange(2026, 9, at('2026-08-15T03:00:00Z'));

  // Assert
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.messageKey, 'xls.futureMonth');
});

test('a year in the future is refused even for an earlier month', () => {
  // Act
  const r = resolveMonthRange(2027, 1, at('2026-08-15T03:00:00Z'));

  // Assert
  assert.equal(r.ok && 'unexpectedly accepted', false);
});

test('a month before the feature existed is refused, and says when it started', () => {
  // Act
  const r = resolveMonthRange(2026, 4, at('2026-08-15T03:00:00Z'));

  // Assert
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.messageKey, 'xls.beforeStart');
  assert.deepEqual(r.vars, { year: 2026, month: 5 });
});

test('the first month the feature existed is accepted', () => {
  // Act
  const r = resolveMonthRange(2026, 5, at('2026-08-15T03:00:00Z'));

  // Assert
  assert.equal(r.ok, true);
});

test('a month outside 1-12 is refused', () => {
  // Act + Assert
  for (const month of [0, 13, -1]) {
    const r = resolveMonthRange(2026, month, at('2026-08-15T03:00:00Z'));
    assert.equal(r.ok, false, `month ${month} must not resolve`);
    if (!r.ok) assert.equal(r.messageKey, 'xls.badYearMonth');
  }
});

test('a non-integer year or month is refused rather than truncated', () => {
  // Act + Assert
  for (const [year, month] of [[2026.5, 6], [2026, 6.5], [NaN, 6], [2026, NaN]]) {
    const r = resolveMonthRange(year, month, at('2026-08-15T03:00:00Z'));
    assert.equal(r.ok, false, `${year}-${month} must not resolve`);
  }
});

test('the day keys are contiguous, ordered and match the stated bounds', () => {
  // Act
  const r = resolveMonthRange(2026, 6, at('2026-08-15T03:00:00Z'));

  // Assert
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.dayKeys[0], r.startKey);
  assert.equal(r.dayKeys.at(-1), r.endKey);
  const sorted = [...r.dayKeys].sort();
  assert.deepEqual(r.dayKeys, sorted, 'keys must already be in order');
  assert.equal(new Set(r.dayKeys).size, r.dayKeys.length, 'no key repeats');
});
