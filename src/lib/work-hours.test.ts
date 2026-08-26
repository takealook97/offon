import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORK_HOURS,
  standardWorkMinutes,
  halfDayCreditMinutes,
  halfDaySplitMinutes,
  halfDayBounds,
} from './work-hours';

const hours = (start: number, end: number, meal: number) => ({
  workStartMinutes: start,
  workEndMinutes: end,
  mealMinutes: meal,
});

// --- The defaults must reproduce what used to be hardcoded -------------------

test('the defaults reproduce the constants they replaced', () => {
  // 480, 240 and 13:00 were written out separately in three files. If any of
  // these drifts, an existing install silently starts computing overtime,
  // half-day credit or the calendar split differently after upgrading.
  assert.equal(standardWorkMinutes(DEFAULT_WORK_HOURS), 480); // was STANDARD_MINUTES
  assert.equal(halfDayCreditMinutes(DEFAULT_WORK_HOURS), 240); // was HALF_DAY_CREDIT_MINUTES
  assert.equal(halfDaySplitMinutes(DEFAULT_WORK_HOURS), 13 * 60); // was the 13 in halfDayIsoRange
});

// --- A standard day ---------------------------------------------------------

test('a standard day is the working window minus the meal', () => {
  assert.equal(standardWorkMinutes(hours(9 * 60, 18 * 60, 60)), 480);
});

test('a shorter meal makes the standard day longer', () => {
  // The meal is unpaid time inside the window, so trimming it means more of
  // the same window counts as work.
  assert.equal(standardWorkMinutes(hours(9 * 60, 18 * 60, 30)), 510);
});

test('a standard day never goes negative', () => {
  // A meal longer than the window is nonsense, but if it produced a negative
  // standard every minute worked would register as overtime.
  assert.equal(standardWorkMinutes(hours(9 * 60, 10 * 60, 120)), 0);
});

test('a window exactly as long as the meal leaves no work in it', () => {
  assert.equal(standardWorkMinutes(hours(9 * 60, 10 * 60, 60)), 0);
});

// --- Half days --------------------------------------------------------------

test('a half day is worth half a standard day', () => {
  assert.equal(halfDayCreditMinutes(hours(9 * 60, 18 * 60, 30)), 255);
});

test('the split is where the morning credit runs out, not the middle of the day', () => {
  // 09:00-18:00 has its midpoint at 13:30, but the split is 13:00. Taking the
  // morning off means being away 09:00-13:00 — exactly the four hours credited.
  // Using the midpoint would hand the morning half an extra 30 minutes that the
  // afternoon half never gets.
  assert.equal(halfDaySplitMinutes(hours(9 * 60, 18 * 60, 60)), 13 * 60);
  assert.notEqual(halfDaySplitMinutes(hours(9 * 60, 18 * 60, 60)), 13 * 60 + 30);
});

test('the split moves with the working hours', () => {
  // 08:00-17:00 with a 60 minute meal: standard 480, credit 240, split at 12:00.
  assert.equal(halfDaySplitMinutes(hours(8 * 60, 17 * 60, 60)), 12 * 60);
});

test('a morning half day runs from the start of the day to the split', () => {
  assert.deepEqual(halfDayBounds(DEFAULT_WORK_HOURS, 'HALF_DAY_AM'), {
    startMinutes: 9 * 60,
    endMinutes: 13 * 60,
  });
});

test('an afternoon half day runs from the split to the end of the day', () => {
  assert.deepEqual(halfDayBounds(DEFAULT_WORK_HOURS, 'HALF_DAY_PM'), {
    startMinutes: 13 * 60,
    endMinutes: 18 * 60,
  });
});

test('the two halves meet exactly, with no gap and no overlap', () => {
  // A gap or an overlap shows up on the calendar as two half days fighting for
  // the same row.
  for (const h of [hours(9 * 60, 18 * 60, 60), hours(7 * 60, 16 * 60, 45), hours(10 * 60, 19 * 60, 90)]) {
    assert.equal(
      halfDayBounds(h, 'HALF_DAY_AM').endMinutes,
      halfDayBounds(h, 'HALF_DAY_PM').startMinutes,
    );
  }
});

test('an odd standard day splits on the half minute rather than rounding', () => {
  // 09:00-18:00 with a 45 minute meal is 495 minutes, so the credit is 247.5.
  // Rounding here would make the two halves add up to something other than a
  // whole day, and the Excel totals would drift by a minute per half day taken.
  const h = hours(9 * 60, 18 * 60, 45);
  assert.equal(halfDayCreditMinutes(h), 247.5);
  assert.equal(halfDayCreditMinutes(h) * 2, standardWorkMinutes(h));
});
