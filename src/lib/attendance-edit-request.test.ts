import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import {
  isAwayNow,
  storedMealMinutes,
  clockInMatchesWorkDate,
  isPendingConflict,
} from './attendance-edit-request';

const at = (iso: string) => new Date(iso);

// --- Away right now ---------------------------------------------------------

test('a session with no breaks is not away', () => {
  assert.equal(isAwayNow([]), false);
});

test('a break that has ended does not count as away', () => {
  assert.equal(isAwayNow([{ endAt: at('2026-08-26T05:00:00Z') }]), false);
});

test('an open break means the person is away right now', () => {
  // An unfinished span has no length, so it cannot go into the proposed timeline.
  assert.equal(isAwayNow([{ endAt: null }]), true);
});

test('one open break among closed ones is still away', () => {
  // Looking only at the last break, rather than any of them, misses this.
  assert.equal(
    isAwayNow([
      { endAt: at('2026-08-26T02:00:00Z') },
      { endAt: null },
      { endAt: at('2026-08-26T05:00:00Z') },
    ]),
    true,
  );
});

// --- The lengths of meals already saved -------------------------------------

test('a stored meal reports its own length', () => {
  assert.deepEqual(
    storedMealMinutes([
      { startAt: at('2026-08-26T03:00:00Z'), endAt: at('2026-08-26T04:00:00Z'), kind: 'LUNCH' },
    ]),
    [60],
  );
});

test('a meal saved under the old setting keeps its old length', () => {
  // After the setting changes from 60 to 45, correcting only a clock-out must still find
  // this 60 in the allow-list, or the meal quietly shrinks to 45.
  assert.deepEqual(
    storedMealMinutes([
      { startAt: at('2026-08-26T03:00:00Z'), endAt: at('2026-08-26T04:00:00Z'), kind: 'LUNCH' },
      { startAt: at('2026-08-27T03:00:00Z'), endAt: at('2026-08-27T03:45:00Z'), kind: 'LUNCH' },
    ]),
    [60, 45],
  );
});

test('ordinary breaks are not meals', () => {
  // Letting break lengths into the meal allow-list would let a meal of any length through.
  assert.deepEqual(
    storedMealMinutes([
      { startAt: at('2026-08-26T03:00:00Z'), endAt: at('2026-08-26T03:20:00Z'), kind: 'BREAK' },
    ]),
    [],
  );
});

test('an open meal has no length to report yet', () => {
  assert.deepEqual(
    storedMealMinutes([{ startAt: at('2026-08-26T03:00:00Z'), endAt: null, kind: 'LUNCH' }]),
    [],
  );
});

test('a meal off the minute rounds rather than leaking seconds', () => {
  // Seconds coming straight from the database would never match an allow-list compared in whole minutes.
  assert.deepEqual(
    storedMealMinutes([
      { startAt: at('2026-08-26T03:00:20Z'), endAt: at('2026-08-26T04:00:10Z'), kind: 'LUNCH' },
    ]),
    [60],
  );
});

// --- Does the clock-in still fall on the work date --------------------------

test('a clock-in on its own work date is fine', () => {
  assert.equal(clockInMatchesWorkDate('2026-08-26T00:30:00Z', at('2026-08-26T00:00:00Z')), true);
});

test('a clock-in moved to another day is refused', () => {
  // Contradicting the work date robs the one-row-per-day constraint of its meaning and
  // points the missing-record reminders at the wrong day.
  assert.equal(clockInMatchesWorkDate('2026-08-27T00:30:00Z', at('2026-08-26T00:00:00Z')), false);
});

test('late-evening local time still belongs to the same work date', () => {
  // In the default org timezone, 08-26 22:00 is 08-26 13:00 UTC.
  assert.equal(clockInMatchesWorkDate('2026-08-26T13:00:00Z', at('2026-08-26T00:00:00Z')), true);
});

test('the work date is read in the org timezone, not UTC', () => {
  // workDate is a @db.Date and arrives as midnight UTC, which in Seoul is already 09:00 that
  // same day. Unless both values are read by the same rule, this test and the 22:00 one above
  // cannot both pass.
  assert.equal(
    clockInMatchesWorkDate('2026-08-25T15:00:00Z', at('2026-08-26T00:00:00Z')),
    true, // 08-26 00:00 local
  );
});

// --- Telling a duplicate request apart --------------------------------------

const p2002 = (target: unknown, modelName = 'AttendanceEditRequest') =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { modelName, target },
  });

test('the shape Postgres actually sends is recognised', () => {
  // Prisma reports the column, not the index name. The earlier version looked only for the
  // name and never matched once, so a request losing the race fell through to a 500 instead
  // of a 409. This shape was printed from a real collision:
  // {modelName:'AttendanceEditRequest', target:['session_id']}
  assert.equal(isPendingConflict(p2002(['session_id'])), true);
});

test('a clash reported by index name is also recognised', () => {
  // So a driver that starts reporting the name cannot quietly undo the fix.
  assert.equal(isPendingConflict(p2002('attendance_edit_requests_pending_unique')), true);
  assert.equal(isPendingConflict(p2002(['attendance_edit_requests_pending_unique'])), true);
});

test('the same column on another model is not this conflict', () => {
  // attendance_breaks also has a partial unique on session_id. Going by the column alone
  // would answer with the wrong message: that a correction is already waiting.
  assert.equal(isPendingConflict(p2002(['session_id'], 'AttendanceBreak')), false);
});

test('a clash on some other unique index is not a duplicate request', () => {
  // Lumping everything into a 409 tells people something untrue about a pending request.
  assert.equal(isPendingConflict(p2002(['email'], 'Member')), false);
});

test('a different prisma error is not a duplicate request', () => {
  const notFound = new Prisma.PrismaClientKnownRequestError('not found', {
    code: 'P2025',
    clientVersion: 'test',
  });
  assert.equal(isPendingConflict(notFound), false);
});

test('a plain error is not a duplicate request', () => {
  // A true here would hide a genuine failure behind a 409.
  assert.equal(isPendingConflict(new Error('boom')), false);
  assert.equal(isPendingConflict(null), false);
});
