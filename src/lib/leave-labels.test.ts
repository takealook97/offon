import test from 'node:test';
import assert from 'node:assert/strict';
import { leaveTypeKey, withWeekdayKST, formatLeaveDateRangeStr } from './leave-labels';

/**
 * The wording of a leave notice. Small, but it is what a person reads in Slack when their
 * request is approved, and a range that reads back as the wrong day is worse than no notice.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

test('each leave type maps to its own key', () => {
  // Act + Assert
  assert.equal(leaveTypeKey('FULL_DAY'), 'appr.leave');
  assert.equal(leaveTypeKey('HALF_DAY_AM'), 'leave.amHalf');
  assert.equal(leaveTypeKey('HALF_DAY_PM'), 'leave.pmHalf');
});

test('an unrecognised type falls back to a full day rather than breaking the notice', () => {
  // Act + Assert
  assert.equal(leaveTypeKey('SABBATICAL'), 'appr.leave');
  assert.equal(leaveTypeKey(''), 'appr.leave');
});

test('the weekday appended is the one the date actually falls on', () => {
  // Arrange: 2026-06-01 is a Monday, 2026-06-06 a Saturday.
  // Act + Assert
  assert.equal(withWeekdayKST('2026-06-01', WEEKDAYS), '2026-06-01(Mon)');
  assert.equal(withWeekdayKST('2026-06-06', WEEKDAYS), '2026-06-06(Sat)');
});

test('a single day reads as one date, with no dash', () => {
  // Act
  const text = formatLeaveDateRangeStr('2026-06-01', '2026-06-01', WEEKDAYS);

  // Assert
  assert.equal(text, '2026-06-01(Mon)');
  assert.ok(!text.includes('~'), 'one day is not a range');
});

test('a real range names both ends', () => {
  // Act
  const text = formatLeaveDateRangeStr('2026-06-01', '2026-06-03', WEEKDAYS);

  // Assert
  assert.equal(text, '2026-06-01(Mon) ~ 2026-06-03(Wed)');
});

test('the weekday does not drift with the month or the year', () => {
  // Arrange: dates built with Date.UTC would shift a day if local time crept in.
  // Act + Assert
  assert.equal(withWeekdayKST('2026-01-01', WEEKDAYS), '2026-01-01(Thu)');
  assert.equal(withWeekdayKST('2026-12-31', WEEKDAYS), '2026-12-31(Thu)');
  assert.equal(withWeekdayKST('2028-02-29', WEEKDAYS), '2028-02-29(Tue)');
});
