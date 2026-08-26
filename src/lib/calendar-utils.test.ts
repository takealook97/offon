import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, zonedIsoFromDate, addDaysUtc, halfDayIsoRange } from './calendar-utils';

/** The timezone is read from the environment at call time, so a test can swap it out. */
function inTimezone(timeZone: string, run: () => void): void {
  const previous = process.env.NEXT_PUBLIC_TIMEZONE;
  process.env.NEXT_PUBLIC_TIMEZONE = timeZone;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_TIMEZONE;
    else process.env.NEXT_PUBLIC_TIMEZONE = previous;
  }
}

// A @db.Date is read as midnight UTC.
const AUG26 = new Date('2026-08-26T00:00:00Z');

// --- parseDate --------------------------------------------------------------

test('a missing range parameter is null rather than Invalid Date', () => {
  // An Invalid Date rather than null blows up the whole Prisma query.
  assert.equal(parseDate(null), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('not-a-date'), null);
});

test('an ISO date parses to that instant', () => {
  assert.equal(parseDate('2026-08-26T00:00:00Z')?.toISOString(), '2026-08-26T00:00:00.000Z');
});

// --- zonedIsoFromDate -------------------------------------------------------

test('a calendar day is read in the org timezone, not with a fixed offset', () => {
  // This used to write +09:00 straight into the string. The client takes the instant and
  // places it on the org's wall clock, so for anyone outside Seoul leave landed wrong entirely.
  inTimezone('Asia/Seoul', () => {
    assert.equal(zonedIsoFromDate(AUG26), '2026-08-25T15:00:00.000Z'); // KST 8/26 00:00
  });
  inTimezone('America/New_York', () => {
    assert.equal(zonedIsoFromDate(AUG26), '2026-08-26T04:00:00.000Z'); // EDT 8/26 00:00
  });
  inTimezone('UTC', () => {
    assert.equal(zonedIsoFromDate(AUG26), '2026-08-26T00:00:00.000Z');
  });
});

test('an hour of day is that hour on the org wall clock', () => {
  inTimezone('America/New_York', () => {
    assert.equal(zonedIsoFromDate(AUG26, 9), '2026-08-26T13:00:00.000Z'); // EDT 09:00
  });
});

test('the date comes from UTC fields, so a @db.Date never slips a day', () => {
  // startDate is read as midnight UTC. Using the local getters would give the previous day on
  // a runtime with a negative offset.
  inTimezone('Asia/Seoul', () => {
    assert.ok(zonedIsoFromDate(new Date('2026-01-01T00:00:00Z')).startsWith('2025-12-31T15:00'));
  });
});

// --- addDaysUtc -------------------------------------------------------------

test('the exclusive end of a full-day leave is the next day', () => {
  assert.equal(addDaysUtc(AUG26, 1).toISOString(), '2026-08-27T00:00:00.000Z');
});

test('adding a day crosses a month boundary', () => {
  assert.equal(
    addDaysUtc(new Date('2026-08-31T00:00:00Z'), 1).toISOString(),
    '2026-09-01T00:00:00.000Z',
  );
});

test('adding days does not mutate the date it was given', () => {
  const original = new Date('2026-08-26T00:00:00Z');
  addDaysUtc(original, 5);
  assert.equal(original.toISOString(), '2026-08-26T00:00:00.000Z');
});

// --- halfDayIsoRange --------------------------------------------------------

test('a morning half day runs 09:00 to 13:00 on the org clock', () => {
  inTimezone('Asia/Seoul', () => {
    assert.deepEqual(halfDayIsoRange(AUG26, 'HALF_DAY_AM'), {
      start: '2026-08-26T00:00:00.000Z', // KST 09:00
      end: '2026-08-26T04:00:00.000Z', // KST 13:00
    });
  });
});

test('an afternoon half day runs 13:00 to 18:00 on the org clock', () => {
  inTimezone('Asia/Seoul', () => {
    assert.deepEqual(halfDayIsoRange(AUG26, 'HALF_DAY_PM'), {
      start: '2026-08-26T04:00:00.000Z',
      end: '2026-08-26T09:00:00.000Z',
    });
  });
});

test('half days land on the right day in a western timezone', () => {
  // This was the broken case: with +09:00 fixed, a morning half day was drawn from 8pm the previous evening to midnight.
  inTimezone('America/New_York', () => {
    const am = halfDayIsoRange(AUG26, 'HALF_DAY_AM');
    assert.equal(am.start, '2026-08-26T13:00:00.000Z'); // EDT 8/26 09:00
    assert.equal(am.end, '2026-08-26T17:00:00.000Z'); // EDT 8/26 13:00
  });
});

test('morning ends exactly where afternoon begins', () => {
  // An overlap has the two half days pushing each other around on the calendar.
  inTimezone('Asia/Seoul', () => {
    assert.equal(
      halfDayIsoRange(AUG26, 'HALF_DAY_AM').end,
      halfDayIsoRange(AUG26, 'HALF_DAY_PM').start,
    );
  });
});
