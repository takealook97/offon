import test from 'node:test';
import assert from 'node:assert/strict';
import { clippedDailyTotals, type SourceAttendance } from './calendar-aggregation';

/**
 * The numbers this produces are the dashboard's worked-today figure, the calendar's daily
 * totals and the worked time in the Excel export. This one function is the only reason all
 * three agree, so when it is wrong, all three are wrong together.
 *
 * Every time here is written in the default org timezone.
 */

const kst = (day: number, h: number, m = 0) =>
  new Date(Date.UTC(2026, 7, day, h - 9, m)); // KST = UTC+9

const NOW = kst(26, 18);

const day = (
  status: SourceAttendance['status'],
  sessions: [Date, Date | null][],
  breaks: [Date, Date | null][] = [],
): SourceAttendance => ({
  status,
  sessions: sessions.map(([startAt, endAt]) => ({ startAt, endAt })),
  breaks: breaks.map(([startAt, endAt]) => ({ startAt, endAt })),
});

// --- The basics -------------------------------------------------------------

test('nothing in, nothing out', () => {
  assert.deepEqual(clippedDailyTotals([], NOW), {});
});

test('a finished day counts the hours between clock-in and clock-out', () => {
  const totals = clippedDailyTotals([day('DONE', [[kst(26, 9), kst(26, 18)]])], NOW);

  assert.equal(totals['2026-08-26'].workedMinutes, 540);
  assert.equal(totals['2026-08-26'].breakMinutes, 0);
  assert.equal(totals['2026-08-26'].attendanceStatus, 'DONE');
});

test('a break is subtracted from the worked time, not added to it', () => {
  // With the sign the other way, the longer the break the more work it records.
  const totals = clippedDailyTotals(
    [day('DONE', [[kst(26, 9), kst(26, 18)]], [[kst(26, 12), kst(26, 13)]])],
    NOW,
  );

  assert.equal(totals['2026-08-26'].workedMinutes, 480);
  assert.equal(totals['2026-08-26'].breakMinutes, 60);
});

test('two sessions in one day add up', () => {
  const totals = clippedDailyTotals(
    [
      day('DONE', [
        [kst(26, 9), kst(26, 12)],
        [kst(26, 13), kst(26, 18)],
      ]),
    ],
    NOW,
  );

  assert.equal(totals['2026-08-26'].workedMinutes, 480);
});

// --- Still running ----------------------------------------------------------

test('an open session while working counts up to now', () => {
  const totals = clippedDailyTotals([day('WORKING', [[kst(26, 9), null]])], NOW);

  assert.equal(totals['2026-08-26'].workedMinutes, 540); // 09:00~18:00
  assert.equal(totals['2026-08-26'].attendanceStatus, 'WORKING');
});

test('an open session on a day that was never closed out counts nothing', () => {
  // MISSING is a past day nobody clocked out of. Filling it to now would pile days of time onto one date.
  const totals = clippedDailyTotals([day('MISSING', [[kst(25, 9), null]])], NOW);

  assert.deepEqual(totals, {});
});

test('a meal already scheduled to end in the future is only counted up to now', () => {
  // A meal is stored with its end already fixed in the future. Subtracting it whole deducts
  // an hour that has not happened, so pressing the meal button drops the worked time at once.
  const now = kst(26, 12, 30);
  const totals = clippedDailyTotals(
    [day('ON_BREAK', [[kst(26, 9), null]], [[kst(26, 12), kst(26, 13)]])],
    now,
  );

  assert.equal(totals['2026-08-26'].breakMinutes, 30); // 30, not 60
  assert.equal(totals['2026-08-26'].workedMinutes, 180); // 210 - 30
});

test('an open break while away counts up to now', () => {
  const now = kst(26, 12, 30);
  const totals = clippedDailyTotals(
    [day('ON_BREAK', [[kst(26, 9), null]], [[kst(26, 12), null]])],
    now,
  );

  assert.equal(totals['2026-08-26'].breakMinutes, 30);
  assert.equal(totals['2026-08-26'].attendanceStatus, 'ON_BREAK');
});

// --- Work crossing midnight -------------------------------------------------

test('a night shift is split across the two days it touches', () => {
  // Putting it all on one day makes the night shift read as twice the hours actually worked.
  const totals = clippedDailyTotals([day('DONE', [[kst(26, 22), kst(27, 2)]])], kst(27, 9));

  assert.equal(totals['2026-08-26'].workedMinutes, 120); // 22:00~24:00
  assert.equal(totals['2026-08-27'].workedMinutes, 120); // 00:00~02:00
});

test('a break that crosses midnight is split the same way', () => {
  const totals = clippedDailyTotals(
    [day('DONE', [[kst(26, 20), kst(27, 4)]], [[kst(26, 23), kst(27, 1)]])],
    kst(27, 9),
  );

  assert.equal(totals['2026-08-26'].breakMinutes, 60);
  assert.equal(totals['2026-08-27'].breakMinutes, 60);
  assert.equal(totals['2026-08-26'].workedMinutes, 180); // 20:00-24:00 less an hour
  assert.equal(totals['2026-08-27'].workedMinutes, 180); // 00:00-04:00 less an hour
});

// --- Edges and guards -------------------------------------------------------

test('worked minutes never go negative', () => {
  // Broken data, with a break recorded longer than the session. A negative would print as minus thirty minutes on screen.
  const totals = clippedDailyTotals(
    [day('DONE', [[kst(26, 9), kst(26, 10)]], [[kst(26, 9), kst(26, 12)]])],
    NOW,
  );

  assert.equal(totals['2026-08-26'].workedMinutes, 0);
});

test('a zero-length session produces no day at all', () => {
  assert.deepEqual(clippedDailyTotals([day('DONE', [[kst(26, 9), kst(26, 9)]])], NOW), {});
});

test('when a day has both a finished and a running attendance, running wins', () => {
  // Settling on DONE would make an open session look frozen on screen.
  const totals = clippedDailyTotals(
    [day('DONE', [[kst(26, 9), kst(26, 12)]]), day('WORKING', [[kst(26, 13), null]])],
    NOW,
  );

  assert.equal(totals['2026-08-26'].attendanceStatus, 'WORKING');
  assert.equal(totals['2026-08-26'].workedMinutes, 480); // 180 + 300
});

test('an absurdly long session stops instead of looping forever', () => {
  // A 400-day bound covers broken data such as a session years long. Without it the request never finishes.
  const totals = clippedDailyTotals(
    [day('DONE', [[kst(26, 9), new Date(Date.UTC(2040, 0, 1))]])],
    NOW,
  );

  assert.ok(Object.keys(totals).length <= 400);
  assert.ok(Object.keys(totals).length > 0);
});
