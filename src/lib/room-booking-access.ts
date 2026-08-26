/**
 * Decides whether a booking may be edited or cancelled.
 *
 * In the route this decision was tangled up with building a NextResponse, so no test could
 * reach it. Pulled out on its own, the rule itself can be checked, and the route is left
 * with nothing but turning a reason into a status code.
 *
 * A pure function. `now` is a parameter so that deciding whether a meeting has already
 * ended does not depend on the clock, which would make the tests depend on when they run.
 */

export type BookingAccessReason = 'not_confirmed' | 'not_owner' | 'already_ended';

export type BookingAccess = { ok: true } | { ok: false; reason: BookingAccessReason };

export type ManageableBooking = {
  memberId: number;
  status: string;
  endAt: Date;
};

export type BookingViewer = { memberId: number; role: string };

export function canManageBooking(
  booking: ManageableBooking,
  viewer: BookingViewer,
  now: Date,
): BookingAccess {
  // Cancelling or editing an already-cancelled booking leaves a state that contradicts the cancellation DM already sent.
  if (booking.status !== 'CONFIRMED') return { ok: false, reason: 'not_confirmed' };

  // Moving someone else's meeting changes the schedule of everyone attending, with no notice.
  // Somebody has to free a room booked by a person who has left.
  if (booking.memberId !== viewer.memberId && viewer.role !== 'ADMIN') {
    return { ok: false, reason: 'not_owner' };
  }

  // A finished meeting is a record. Editing it frees no room and only notifies attendees about the past.
  if (booking.endAt < now) return { ok: false, reason: 'already_ended' };

  return { ok: true };
}
