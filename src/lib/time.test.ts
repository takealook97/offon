import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWeekendKSTDateStr,
  countWeekdaysKST,
  isBusinessDayKSTDateStr,
  countBusinessDaysKST,
  kstDayKey,
  kstDayBoundsUtc,
  clipMinutes,
} from './time';

// 2026-08-24 is a Monday, 08-28 a Friday, 08-29 a Saturday and 08-30 a Sunday.
const MON = '2026-08-24';
const FRI = '2026-08-28';
const SAT = '2026-08-29';
const SUN = '2026-08-30';

test('recognizes weekends', () => {
  assert.equal(isWeekendKSTDateStr(SAT), true);
  assert.equal(isWeekendKSTDateStr(SUN), true);
  assert.equal(isWeekendKSTDateStr(MON), false);
  assert.equal(isWeekendKSTDateStr(FRI), false);
});

test('counts a Monday-to-Friday span as five weekdays', () => {
  assert.equal(countWeekdaysKST(MON, FRI), 5);
});

test('counts a single weekday as one and a single weekend day as zero', () => {
  assert.equal(countWeekdaysKST(MON, MON), 1);
  assert.equal(countWeekdaysKST(SAT, SAT), 0);
});

test('excludes the weekend inside a span that crosses it', () => {
  // Monday to the following Monday is eight days, six of them weekdays.
  assert.equal(countWeekdaysKST(MON, '2026-08-31'), 6);
});

test('returns zero when the range is inverted', () => {
  assert.equal(countWeekdaysKST(FRI, MON), 0);
  assert.equal(countBusinessDaysKST(FRI, MON, new Set()), 0);
});

test('returns zero for an unparseable date instead of NaN', () => {
  assert.equal(countWeekdaysKST('not-a-date', FRI), 0);
  assert.equal(countWeekdaysKST(MON, 'not-a-date'), 0);
});

test('treats a holiday as a non-business day', () => {
  const holidays = new Set([FRI]);
  assert.equal(isBusinessDayKSTDateStr(FRI, holidays), false);
  assert.equal(isBusinessDayKSTDateStr(MON, holidays), true);
});

test('a weekend is not a business day even when no holidays are configured', () => {
  assert.equal(isBusinessDayKSTDateStr(SAT, new Set()), false);
});

test('subtracts holidays from the business-day count', () => {
  assert.equal(countBusinessDaysKST(MON, FRI, new Set()), 5);
  assert.equal(countBusinessDaysKST(MON, FRI, new Set(['2026-08-26'])), 4);
});

test('does not double-count a holiday that lands on a weekend', () => {
  // A holiday falling on a Saturday must leave the five weekdays untouched.
  assert.equal(countBusinessDaysKST(MON, SUN, new Set([SAT])), 5);
});

test('counts zero business days for a week that is entirely holidays', () => {
  const week = new Set([MON, '2026-08-25', '2026-08-26', '2026-08-27', FRI]);
  assert.equal(countBusinessDaysKST(MON, FRI, week), 0);
});

test('maps a UTC instant to the KST day it falls on', () => {
  // 2026-08-24T15:00Z is 08-25 00:00 in Seoul: the date rolls over.
  assert.equal(kstDayKey(new Date('2026-08-24T14:59:59Z')), '2026-08-24');
  assert.equal(kstDayKey(new Date('2026-08-24T15:00:00Z')), '2026-08-25');
});

test('day bounds run from 00:00 KST to the next 00:00 KST', () => {
  const { start, end } = kstDayBoundsUtc('2026-08-25');
  assert.equal(start.toISOString(), '2026-08-24T15:00:00.000Z');
  assert.equal(end.toISOString(), '2026-08-25T15:00:00.000Z');
});

test('day bounds and day key agree at the boundary', () => {
  const key = '2026-08-25';
  const { start, end } = kstDayBoundsUtc(key);
  assert.equal(kstDayKey(start), key);
  // The end is exclusive, so it belongs to the following day.
  assert.equal(kstDayKey(end), '2026-08-26');
});

test('clips a segment that lies wholly inside the day', () => {
  const dayStart = new Date('2026-08-24T15:00:00Z'); // 8/25 00:00 KST
  const dayEnd = new Date('2026-08-25T15:00:00Z');
  // 09:00 to 18:00 local is 540 minutes.
  assert.equal(
    clipMinutes(
      new Date('2026-08-25T00:00:00Z'),
      new Date('2026-08-25T09:00:00Z'),
      dayStart,
      dayEnd,
    ),
    540,
  );
});

test('clips a segment that starts before the day begins', () => {
  const dayStart = new Date('2026-08-24T15:00:00Z');
  const dayEnd = new Date('2026-08-25T15:00:00Z');
  // Starting 23:00 the previous day and ending 01:00 on this one leaves 60 minutes for this day.
  assert.equal(
    clipMinutes(
      new Date('2026-08-24T14:00:00Z'),
      new Date('2026-08-24T16:00:00Z'),
      dayStart,
      dayEnd,
    ),
    60,
  );
});

test('returns zero for a segment entirely outside the day', () => {
  const dayStart = new Date('2026-08-24T15:00:00Z');
  const dayEnd = new Date('2026-08-25T15:00:00Z');
  assert.equal(
    clipMinutes(
      new Date('2026-08-26T00:00:00Z'),
      new Date('2026-08-26T01:00:00Z'),
      dayStart,
      dayEnd,
    ),
    0,
  );
});

test('returns zero rather than a negative for an inverted segment', () => {
  const dayStart = new Date('2026-08-24T15:00:00Z');
  const dayEnd = new Date('2026-08-25T15:00:00Z');
  assert.equal(
    clipMinutes(
      new Date('2026-08-25T09:00:00Z'),
      new Date('2026-08-25T08:00:00Z'),
      dayStart,
      dayEnd,
    ),
    0,
  );
});
