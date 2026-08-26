import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampEndToNextBooking,
  defaultEndWall,
  findConflict,
  validateBookingRange,
  type BookingSlot,
} from './room-booking';

const D = '2026-08-05';
const at = (hhmm: string) => `${D}T${hhmm}`;
/** The "now" validation runs against. Most cases sit after it, so the past-date rule does not fire. */
const NOW = `${D}T00:00`;

function expectFail(
  result: ReturnType<typeof validateBookingRange>,
  needle: string,
) {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(
    result.messageKey === needle,
    `expected messageKey ${JSON.stringify(needle)}, got ${JSON.stringify(result.messageKey)}`,
  );
}

// ── validateBookingRange ──────────────────────────────────────────────

test('accepts the smallest bookable slot at opening time', () => {
  assert.deepEqual(validateBookingRange(at('08:00'), at('08:10'), NOW), { ok: true });
});

test('accepts a booking that ends exactly at closing time', () => {
  assert.deepEqual(validateBookingRange(at('18:50'), at('19:00'), NOW), { ok: true });
});

test('rejects a start before opening time', () => {
  expectFail(validateBookingRange(at('07:50'), at('08:30'), NOW), 'valid.openHours');
});

test('rejects an end after closing time', () => {
  expectFail(validateBookingRange(at('18:00'), at('19:10'), NOW), 'valid.openHours');
});

test('rejects a start that is not on a 10-minute boundary', () => {
  expectFail(validateBookingRange(at('10:05'), at('11:00'), NOW), 'valid.stepMinutes');
});

test('rejects an end that is not on a 10-minute boundary', () => {
  expectFail(validateBookingRange(at('10:00'), at('10:55'), NOW), 'valid.stepMinutes');
});

test('rejects an end earlier than the start', () => {
  expectFail(validateBookingRange(at('11:00'), at('10:00'), NOW), 'valid.endBeforeStart');
});

test('rejects a zero-length booking', () => {
  expectFail(validateBookingRange(at('10:00'), at('10:00'), NOW), 'valid.endBeforeStart');
});

test('rejects a booking that crosses midnight into the next day', () => {
  expectFail(validateBookingRange(`${D}T18:00`, '2026-08-06T09:00', NOW), 'valid.sameDayOnly');
});

test('rejects a start in the past', () => {
  expectFail(validateBookingRange(at('09:00'), at('10:00'), at('10:00')), 'valid.pastTime');
});

test('accepts a start exactly at the current time', () => {
  assert.deepEqual(validateBookingRange(at('10:00'), at('11:00'), at('10:00')), {
    ok: true,
  });
});

// ── findConflict ──────────────────────────────────────────────────────

const existing: BookingSlot[] = [{ id: 1, start: at('10:00'), end: at('11:00') }];

test('returns null when a booking starts exactly when another ends', () => {
  assert.equal(findConflict(existing, at('11:00'), at('12:00')), null);
});

test('returns null when a booking ends exactly when another starts', () => {
  assert.equal(findConflict(existing, at('09:00'), at('10:00')), null);
});

test('detects an overlap that starts inside an existing booking', () => {
  assert.equal(findConflict(existing, at('10:50'), at('11:30'))?.id, 1);
});

test('detects an overlap that ends inside an existing booking', () => {
  assert.equal(findConflict(existing, at('09:30'), at('10:10'))?.id, 1);
});

test('detects a booking fully contained in an existing one', () => {
  assert.equal(findConflict(existing, at('10:20'), at('10:40'))?.id, 1);
});

test('detects a booking that fully covers an existing one', () => {
  assert.equal(findConflict(existing, at('09:00'), at('12:00'))?.id, 1);
});

test('ignores the booking being edited when excludeId matches', () => {
  assert.equal(findConflict(existing, at('10:00'), at('11:00'), 1), null);
});

test('returns null for a booking on a different day', () => {
  assert.equal(findConflict(existing, '2026-08-06T10:00', '2026-08-06T11:00'), null);
});

// ── defaultEndWall ────────────────────────────────────────────────────

test('fills in a 30-minute default end', () => {
  assert.equal(defaultEndWall(at('10:00')), at('10:30'));
});

test('clamps the default end to closing time', () => {
  assert.equal(defaultEndWall(at('18:50')), at('19:00'));
});

test('clamps a default end that would overshoot closing time', () => {
  assert.equal(defaultEndWall(at('18:40')), at('19:00'));
});

// ── clampEndToNextBooking ─────────────────────────────────────────────

test('shortens the prefilled end to the next booking start', () => {
  assert.equal(clampEndToNextBooking(existing, at('09:40'), at('10:10')), at('10:00'));
});

test('leaves the end untouched when nothing follows', () => {
  assert.equal(clampEndToNextBooking(existing, at('11:00'), at('11:30')), at('11:30'));
});

test('returns null when the start already sits inside a booking', () => {
  assert.equal(clampEndToNextBooking(existing, at('10:30'), at('11:00')), null);
});

test('ignores the booking being edited when clamping', () => {
  assert.equal(clampEndToNextBooking(existing, at('10:00'), at('11:00'), 1), at('11:00'));
});
