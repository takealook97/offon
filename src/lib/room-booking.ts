import type { MessageKey } from './i18n/dictionary';
import { z } from 'zod';

/**
 * The time rules and overlap checks for meeting-room bookings.
 *
 * Every time here is a wall-clock string (`yyyy-MM-ddTHH:mm`).
 * The format is fixed-width, so comparing lexicographically is comparing chronologically, and validation
 * becomes plain string arithmetic with no room for a timezone to intervene. Conversion to UTC happens only at the server boundary.
 *
 * This file imports nothing but zod. That constraint is what lets the front end, the back end
 * and the tests all run the same functions -- the same approach attendance-edit.ts takes.
 */

/**
 * The bookable window, in minutes from midnight. It varies by organisation and comes from admin settings.
 * It has to match the week grid's bounds, or the grid offers slots that validation then refuses.
 */
export type RoomHours = { openMinutes: number; closeMinutes: number };

/** Used before any setting exists, such as right after seeding: 08:00 to 19:00. */
export const DEFAULT_ROOM_HOURS: RoomHours = {
  openMinutes: 8 * 60,
  closeMinutes: 19 * 60,
};
/** The granularity of a time choice, in minutes. Must match the calendar's `step`. */
export const ROOM_STEP_MINUTES = 10;
/** The length pre-filled when an empty slot is clicked rather than dragged. */
export const DEFAULT_BOOKING_MINUTES = 30;

export const MEETING_TYPES = ['INTERNAL', 'EXTERNAL'] as const;
export type MeetingTypeValue = (typeof MEETING_TYPES)[number];

/** The screen renders in the viewer's language and a Slack DM in the deployment's, each translating for itself. */
export const MEETING_TYPE_KEY: Record<MeetingTypeValue, MessageKey> = {
  INTERNAL: 'room.internal',
  EXTERNAL: 'room.external',
};

const WALL = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'valid.badTimeFormat');

/** The request body sent by the client. Times are wall clock. */
export const RoomBookingBody = z.object({
  roomId: z.coerce.number().int().positive(),
  type: z.enum(MEETING_TYPES),
  title: z.string().trim().min(1, 'valid.reasonRequired').max(100),
  start: WALL,
  end: WALL,
  memberIds: z.array(z.coerce.number().int().positive()).max(30).default([]),
  externalAttendees: z.string().trim().max(500).nullable().optional(),
});
export type RoomBookingBody = z.infer<typeof RoomBookingBody>;

/** An edit request. The room cannot be changed, as the UI offers no picker for it. */
export const RoomBookingPatchBody = RoomBookingBody.omit({ roomId: true });
export type RoomBookingPatchBody = z.infer<typeof RoomBookingPatchBody>;

/** `'2026-08-05T10:30'` to `630`. The format is guaranteed by zod or a regex before this is called. */
export function wallMinutes(wall: string): number {
  return Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
}

/** `'2026-08-05T10:30'` → `'2026-08-05'`. */
export function wallDate(wall: string): string {
  return wall.slice(0, 10);
}

/** Minutes to `'HH:mm'`. Callers never pass anything beyond 24 hours. */
export function minutesToHhMm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Joins a date and a minute-of-day into a wall-clock string. */
export function toWallString(dateStr: string, minutes: number): string {
  return `${dateStr}T${minutesToHhMm(minutes)}`;
}

export type BookingSlot = { id: number; start: string; end: string };

/** Failures come back as keys, not prose. The screen and Slack each render them in their own language. */
export type BookingCheck =
  | { ok: true }
  | { ok: false; messageKey: MessageKey; vars?: Record<string, string | number> };

/**
 * Same day, on the slot granularity, ending after it starts, inside the bookable window, and not in the past.
 *
 * `nowWall` is a parameter so this stays pure and the tests stay deterministic. A start
 * exactly equal to now is allowed: there is no reason to refuse booking from this moment.
 */
export function validateBookingRange(
  start: string,
  end: string,
  nowWall: string,
  hours: RoomHours,
): BookingCheck {
  if (wallDate(start) !== wallDate(end)) {
    return { ok: false, messageKey: 'valid.sameDayOnly' };
  }
  const s = wallMinutes(start);
  const e = wallMinutes(end);
  if (s % ROOM_STEP_MINUTES !== 0 || e % ROOM_STEP_MINUTES !== 0) {
    return { ok: false, messageKey: 'valid.stepMinutes', vars: { step: ROOM_STEP_MINUTES } };
  }
  if (e <= s) {
    return { ok: false, messageKey: 'valid.endBeforeStart' };
  }
  if (s < hours.openMinutes || e > hours.closeMinutes) {
    const open = minutesToHhMm(hours.openMinutes);
    const close = minutesToHhMm(hours.closeMinutes);
    return { ok: false, messageKey: 'valid.openHours', vars: { open, close } };
  }
  if (start < nowWall) {
    return { ok: false, messageKey: 'valid.pastTime' };
  }
  return { ok: true };
}

/**
 * Overlap over the half-open interval. Bookings that merely touch do not overlap.
 * excludeId leaves a booking out of the comparison while it is being edited.
 */
export function findConflict(
  existing: readonly BookingSlot[],
  start: string,
  end: string,
  excludeId?: number,
): BookingSlot | null {
  return (
    existing.find((b) => b.id !== excludeId && b.start < end && b.end > start) ??
    null
  );
}

/**
 * The end time pre-filled when an empty slot is clicked: the default length, clamped to
 * closing time if it would run past.
 */
export function defaultEndWall(
  start: string,
  closeMinutes: number,
  minutes: number = DEFAULT_BOOKING_MINUTES,
): string {
  const end = Math.min(wallMinutes(start) + minutes, closeMinutes);
  return toWallString(wallDate(start), end);
}

/**
 * Clamps the end to the start of the nearest booking after it,
 * so a click never pre-fills a range that runs over someone else's meeting.
 * Returns null when the start already sits inside another booking, since there is nothing to pre-fill.
 */
export function clampEndToNextBooking(
  existing: readonly BookingSlot[],
  start: string,
  end: string,
  excludeId?: number,
): string | null {
  let limit = end;
  for (const b of existing) {
    if (b.id === excludeId) continue;
    if (b.end <= start) continue;
    if (b.start <= start) return null;
    if (b.start < limit) limit = b.start;
  }
  return limit > start ? limit : null;
}

/** The bookings on a given date. Bookings never cross midnight, so matching the date is enough. */
export function bookingsOnDate(
  all: readonly BookingSlot[],
  dateStr: string,
): BookingSlot[] {
  return all.filter((b) => wallDate(b.start) === dateStr);
}
