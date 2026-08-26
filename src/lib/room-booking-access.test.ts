import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageBooking } from './room-booking-access';

const NOW = new Date('2026-08-26T10:00:00Z');
const LATER = new Date('2026-08-26T11:00:00Z');
const EARLIER = new Date('2026-08-26T09:00:00Z');

const OWNER = { memberId: 1, role: 'EMPLOYEE' };
const SOMEONE_ELSE = { memberId: 2, role: 'EMPLOYEE' };
const ADMIN = { memberId: 3, role: 'ADMIN' };

const booking = (over: Partial<{ memberId: number; status: string; endAt: Date }> = {}) => ({
  memberId: 1,
  status: 'CONFIRMED',
  endAt: LATER,
  ...over,
});

test('the person who booked it can manage it', () => {
  assert.deepEqual(canManageBooking(booking(), OWNER, NOW), { ok: true });
});

test('someone else cannot', () => {
  // Moving someone else's meeting changes attendees' schedules with no notice.
  assert.deepEqual(canManageBooking(booking(), SOMEONE_ELSE, NOW), {
    ok: false,
    reason: 'not_owner',
  });
});

test('an admin can manage anyone else booking', () => {
  // Somebody has to free a room booked by a person who has left.
  assert.deepEqual(canManageBooking(booking(), ADMIN, NOW), { ok: true });
});

test('a cancelled booking cannot be managed again', () => {
  // Cancelling or editing it again leaves a state that contradicts the cancellation DM already sent.
  assert.deepEqual(canManageBooking(booking({ status: 'CANCELLED' }), OWNER, NOW), {
    ok: false,
    reason: 'not_confirmed',
  });
});

test('a meeting that has ended cannot be changed', () => {
  // A finished meeting is a record. Editing it frees no room.
  assert.deepEqual(canManageBooking(booking({ endAt: EARLIER }), OWNER, NOW), {
    ok: false,
    reason: 'already_ended',
  });
});

test('a meeting ending exactly now is still manageable', () => {
  // Refusing on the boundary makes a meeting that has just ended impossible to tidy up.
  assert.deepEqual(canManageBooking(booking({ endAt: NOW }), OWNER, NOW), { ok: true });
});

test('a meeting in progress can be changed', () => {
  assert.deepEqual(canManageBooking(booking({ endAt: LATER }), OWNER, NOW), { ok: true });
});

test('being cancelled is reported before not being yours', () => {
  // The other order answers someone else's cancelled booking with a permission error, so they
  // go looking for an admin without ever learning it was cancelled.
  assert.deepEqual(canManageBooking(booking({ status: 'CANCELLED' }), SOMEONE_ELSE, NOW), {
    ok: false,
    reason: 'not_confirmed',
  });
});

test('an admin still cannot revive a cancelled booking', () => {
  assert.deepEqual(canManageBooking(booking({ status: 'CANCELLED' }), ADMIN, NOW), {
    ok: false,
    reason: 'not_confirmed',
  });
});

test('an admin still cannot change a meeting that has ended', () => {
  assert.deepEqual(canManageBooking(booking({ endAt: EARLIER }), ADMIN, NOW), {
    ok: false,
    reason: 'already_ended',
  });
});
