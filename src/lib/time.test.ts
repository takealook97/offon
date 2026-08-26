import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wallToUtc,
  utcToWall,
  toGridDate,
  fromGridDate,
  isWeekendDateStr,
  countWeekdays,
  isBusinessDayDateStr,
  countBusinessDays,
  dayKey,
  dayBoundsUtc,
  clipMinutes,
} from './time';

// 2026-08-24 is a Monday, 08-28 a Friday, 08-29 a Saturday and 08-30 a Sunday.
const MON = '2026-08-24';
const FRI = '2026-08-28';
const SAT = '2026-08-29';
const SUN = '2026-08-30';

test('recognizes weekends', () => {
  assert.equal(isWeekendDateStr(SAT), true);
  assert.equal(isWeekendDateStr(SUN), true);
  assert.equal(isWeekendDateStr(MON), false);
  assert.equal(isWeekendDateStr(FRI), false);
});

test('counts a Monday-to-Friday span as five weekdays', () => {
  assert.equal(countWeekdays(MON, FRI), 5);
});

test('counts a single weekday as one and a single weekend day as zero', () => {
  assert.equal(countWeekdays(MON, MON), 1);
  assert.equal(countWeekdays(SAT, SAT), 0);
});

test('excludes the weekend inside a span that crosses it', () => {
  // Monday to the following Monday is eight days, six of them weekdays.
  assert.equal(countWeekdays(MON, '2026-08-31'), 6);
});

test('returns zero when the range is inverted', () => {
  assert.equal(countWeekdays(FRI, MON), 0);
  assert.equal(countBusinessDays(FRI, MON, new Set()), 0);
});

test('returns zero for an unparseable date instead of NaN', () => {
  assert.equal(countWeekdays('not-a-date', FRI), 0);
  assert.equal(countWeekdays(MON, 'not-a-date'), 0);
});

test('treats a holiday as a non-business day', () => {
  const holidays = new Set([FRI]);
  assert.equal(isBusinessDayDateStr(FRI, holidays), false);
  assert.equal(isBusinessDayDateStr(MON, holidays), true);
});

test('a weekend is not a business day even when no holidays are configured', () => {
  assert.equal(isBusinessDayDateStr(SAT, new Set()), false);
});

test('subtracts holidays from the business-day count', () => {
  assert.equal(countBusinessDays(MON, FRI, new Set()), 5);
  assert.equal(countBusinessDays(MON, FRI, new Set(['2026-08-26'])), 4);
});

test('does not double-count a holiday that lands on a weekend', () => {
  // A holiday falling on a Saturday must leave the five weekdays untouched.
  assert.equal(countBusinessDays(MON, SUN, new Set([SAT])), 5);
});

test('counts zero business days for a week that is entirely holidays', () => {
  const week = new Set([MON, '2026-08-25', '2026-08-26', '2026-08-27', FRI]);
  assert.equal(countBusinessDays(MON, FRI, week), 0);
});

test('maps a UTC instant to the KST day it falls on', () => {
  // 2026-08-24T15:00Z is 08-25 00:00 in Seoul: the date rolls over.
  assert.equal(dayKey(new Date('2026-08-24T14:59:59Z')), '2026-08-24');
  assert.equal(dayKey(new Date('2026-08-24T15:00:00Z')), '2026-08-25');
});

test('day bounds run from 00:00 KST to the next 00:00 KST', () => {
  const { start, end } = dayBoundsUtc('2026-08-25');
  assert.equal(start.toISOString(), '2026-08-24T15:00:00.000Z');
  assert.equal(end.toISOString(), '2026-08-25T15:00:00.000Z');
});

test('day bounds and day key agree at the boundary', () => {
  const key = '2026-08-25';
  const { start, end } = dayBoundsUtc(key);
  assert.equal(dayKey(start), key);
  // The end is exclusive, so it belongs to the following day.
  assert.equal(dayKey(end), '2026-08-26');
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

// --- Any timezone -----------------------------------------------------------
// The timezone is read from the environment at call time, so a test can swap it out.

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

test('day boundaries follow the configured timezone', () => {
  inTimezone('UTC', () => {
    const { start, end } = dayBoundsUtc('2026-08-25');
    assert.equal(start.toISOString(), '2026-08-25T00:00:00.000Z');
    assert.equal(end.toISOString(), '2026-08-26T00:00:00.000Z');
  });
});

test('a New York day starts four hours later than UTC in summer', () => {
  inTimezone('America/New_York', () => {
    // 2026-08-25 is EDT (UTC-4), so midnight is 04:00Z the same day.
    assert.equal(dayBoundsUtc('2026-08-25').start.toISOString(), '2026-08-25T04:00:00.000Z');
  });
});

test('the offset follows daylight saving, it is not a constant', () => {
  inTimezone('America/New_York', () => {
    // Winter is EST (UTC-5), putting midnight at 05:00Z; summer is EDT (UTC-4), at 04:00Z.
    assert.equal(dayBoundsUtc('2026-01-15').start.toISOString(), '2026-01-15T05:00:00.000Z');
    assert.equal(dayBoundsUtc('2026-07-15').start.toISOString(), '2026-07-15T04:00:00.000Z');
  });
});

test('a day that loses an hour to DST is 23 hours long', () => {
  inTimezone('America/New_York', () => {
    // 2026-03-08 is when US Eastern daylight time starts.
    // Taking the end as start + 24h puts the boundary an hour out and miscounts worked time.
    const { start, end } = dayBoundsUtc('2026-03-08');
    assert.equal((end.getTime() - start.getTime()) / 3_600_000, 23);
  });
});

test('a day that gains an hour to DST is 25 hours long', () => {
  inTimezone('America/New_York', () => {
    const { start, end } = dayBoundsUtc('2026-11-01');
    assert.equal((end.getTime() - start.getTime()) / 3_600_000, 25);
  });
});

test('wall-clock input, day key, and display agree in a DST zone', () => {
  inTimezone('America/New_York', () => {
    const instant = wallToUtc('2026-07-15T09:30');
    assert.equal(instant.toISOString(), '2026-07-15T13:30:00.000Z');
    assert.equal(dayKey(instant), '2026-07-15');
    assert.equal(utcToWall(instant), '2026-07-15T09:30');
  });
});

test('a half-hour zone round-trips', () => {
  inTimezone('Asia/Kolkata', () => {
    // UTC+5:30. An implementation assuming whole-hour offsets lands 30 minutes out.
    const instant = wallToUtc('2026-08-25T09:30');
    assert.equal(instant.toISOString(), '2026-08-25T04:00:00.000Z');
    assert.equal(utcToWall(instant), '2026-08-25T09:30');
  });
});

test('an unknown timezone is rejected rather than silently wrong', () => {
  inTimezone('Mars/Olympus_Mons', () => {
    // Falling back to UTC quietly would record attendance hours off. Throwing is better.
    assert.throws(() => dayKey(new Date('2026-08-25T00:00:00Z')), RangeError);
  });
});

test('a grid date carries the organization wall clock in its local fields', () => {
  inTimezone('America/New_York', () => {
    // 09:49 in Seoul is 20:49 EDT the previous day. The grid has to place it at 20:49 for the label and the cell to agree.
    const grid = toGridDate(new Date('2026-08-26T00:49:00Z'));
    assert.equal(grid.getHours(), 20);
    assert.equal(grid.getMinutes(), 49);
    assert.equal(grid.getDate(), 25);
  });
});

test('grid conversion round-trips back to the same instant', () => {
  for (const zone of ['Asia/Seoul', 'America/New_York', 'Asia/Kolkata', 'UTC']) {
    inTimezone(zone, () => {
      const instant = new Date('2026-08-26T00:49:00Z');
      // The round trip is exact to the minute; the grid does not use seconds.
      assert.equal(
        fromGridDate(toGridDate(instant)).toISOString(),
        '2026-08-26T00:49:00.000Z',
        `round trip failed in ${zone}`,
      );
    });
  }
});

test('grid conversion round-trips across a DST transition', () => {
  inTimezone('America/New_York', () => {
    // Just after daylight saving starts. Measuring the offset from the input rather than the result lands an hour out.
    const instant = new Date('2026-03-08T12:00:00Z');
    assert.equal(fromGridDate(toGridDate(instant)).toISOString(), '2026-03-08T12:00:00.000Z');
  });
});
