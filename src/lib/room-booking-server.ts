import { prisma } from './prisma';
import { logAudit } from './audit';
import { cancelScheduledChannel, scheduleDm, sendDm } from './slack';
import { formatZoned } from './time';
import { MEETING_TYPE_KEY } from './room-booking';
import { getDeploymentT, getDeploymentLocale } from './i18n/deployment';
import type { RoomBookingDTO } from './api-types';

/**
 * Server-only helpers shared by the meeting-room route handlers.
 * Next's `route.ts` allows no exports beyond the HTTP methods, hence a separate file.
 * The time rules and overlap checks themselves live in `room-booking.ts`, which the front
 * end shares.
 */

export const bookingInclude = {
  member: { select: { id: true, name: true } },
  attendees: {
    include: {
      member: { select: { id: true, name: true, position: true, deletedAt: true } },
    },
  },
} as const;

export type BookingRow = {
  id: number;
  roomId: number;
  memberId: number;
  title: string;
  type: 'INTERNAL' | 'EXTERNAL';
  startAt: Date;
  endAt: Date;
  externalAttendees: string | null;
  member: { id: number; name: string };
  attendees: {
    member: { id: number; name: string; position: string | null; deletedAt: Date | null };
  }[];
};

/**
 * A stored row as the DTO the client sees. `canManage` means the organiser or an admin.
 * People who have left are marked `inactive` rather than removed from the attendee list,
 * so the record stays true to what happened.
 */
export function toBookingDTO(
  row: BookingRow,
  viewer: { memberId: number; role: string },
): RoomBookingDTO {
  return {
    id: row.id,
    roomId: row.roomId,
    title: row.title,
    type: row.type,
    start: row.startAt.toISOString(),
    end: row.endAt.toISOString(),
    organizer: { id: row.member.id, name: row.member.name },
    attendees: row.attendees.map((a) => ({
      id: a.member.id,
      name: a.member.name,
      position: a.member.position,
      inactive: a.member.deletedAt !== null,
    })),
    externalAttendees: row.externalAttendees,
    canManage: row.memberId === viewer.memberId || viewer.role === 'ADMIN',
  };
}

/**
 * Finds a clash in the same room and words it for the user, or null if there is none.
 * The interval is half-open, so bookings that merely touch — one ending at 10:00, the next
 * starting at 10:00 — do not clash.
 */
export async function findRoomConflict(
  roomId: number,
  startAt: Date,
  endAt: Date,
  excludeId?: number,
): Promise<string | null> {
  const conflict = await prisma.roomBooking.findFirst({
    where: {
      roomId,
      status: 'CONFIRMED',
      deletedAt: null,
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startAt: true, endAt: true, title: true },
  });
  if (!conflict) return null;
  const range = `${formatZoned(conflict.startAt, 'HH:mm')}~${formatZoned(conflict.endAt, 'HH:mm')}`;
  return getDeploymentT()('dm.slotTaken', { range, title: conflict.title });
}

/** Checks every attendee id belongs to an active member. Duplicates are removed before calling. */
export async function allMembersActive(memberIds: number[]): Promise<boolean> {
  if (memberIds.length === 0) return true;
  const found = await prisma.member.count({
    where: { id: { in: memberIds }, deletedAt: null },
  });
  return found === memberIds.length;
}

/** How many minutes before a meeting the reminder goes out. */
export const REMINDER_LEAD_MINUTES = 3;

/**
 * Cancels every pre-meeting DM scheduled for a booking and clears the records.
 *
 * Slack refuses to cancel anything due within 60 seconds, so individual failures are
 * swallowed. A notice already sent cannot be recalled, and failing the edit or cancellation
 * because of it would be worse.
 */
export async function cancelBookingReminders(bookingId: number): Promise<void> {
  const reminders = await prisma.roomBookingReminder.findMany({
    where: { bookingId },
    select: { id: true, channelId: true, scheduledMessageId: true },
  });
  if (reminders.length === 0) return;

  await Promise.all(
    reminders.map((r) =>
      cancelScheduledChannel(r.channelId, r.scheduledMessageId).catch((err) =>
        logAudit({
          action: 'SLACK_SEND_FAIL',
          target: String(bookingId),
          metadata: { stage: 'room_reminder_cancel', error: String(err) },
        }),
      ),
    ),
  );
  await prisma.roomBookingReminder.deleteMany({ where: { bookingId } });
}

const notifyInclude = {
  member: { select: { id: true, name: true, slackId: true, deletedAt: true } },
  attendees: {
    include: {
      member: { select: { id: true, name: true, slackId: true, deletedAt: true } },
    },
  },
} as const;

type NotifiableBooking = {
  title: string;
  type: 'INTERNAL' | 'EXTERNAL';
  startAt: Date;
  endAt: Date;
  member: { id: number; name: string; slackId: string; deletedAt: Date | null };
  attendees: {
    member: { id: number; name: string; slackId: string; deletedAt: Date | null };
  }[];
};

/** Loads the confirmed booking a reminder is for, or null if it was cancelled or deleted. */
async function loadNotifiableBooking(bookingId: number) {
  return prisma.roomBooking.findFirst({
    where: { id: bookingId, status: 'CONFIRMED', deletedAt: null },
    include: notifyInclude,
  });
}

/**
 * Everyone in the meeting: the organiser first, then the attendees in order. An organiser
 * may also be listed as an attendee, so duplicates are removed.
 */
function bookingMembers(booking: NotifiableBooking) {
  return [booking.member, ...booking.attendees.map((a) => a.member)].filter(
    (m, idx, all) => all.findIndex((x) => x.id === m.id) === idx,
  );
}

/**
 * Who receives the DM: the organiser and the attendees. The organiser is included because
 * they are in the meeting too, and because a booking with no attendees still needs a
 * reminder. People who have left are dropped.
 */
function notifyTargets(booking: NotifiableBooking) {
  return bookingMembers(booking).filter((m) => m.deletedAt === null);
}

/** Builds the detail lines in one place so both notices word things the same way. */
function bookingDetailLines(booking: NotifiableBooking): string[] {
  // The organiser is in the meeting, so they lead the attendee line. People who have left stay, so the record remains true.
  const names = bookingMembers(booking).map((m) => m.name);
  return [
    getDeploymentT()('dm.meetingSubject', { title: booking.title }),
    getDeploymentT()('dm.meetingKind', { kind: getDeploymentT()(MEETING_TYPE_KEY[booking.type]) }),
    getDeploymentT()('dm.meetingAttendees', { names: names.join(', ') }),
  ];
}

/** Formats a booking's date and time range for display. */
function bookingWhen(booking: NotifiableBooking): string {
  const date = formatZoned(booking.startAt, 'yyyy-MM-dd (EEE)', getDeploymentLocale());
  return `${date} ${formatZoned(booking.startAt, 'a h:mm')} ~ ${formatZoned(booking.endAt, 'a h:mm')}`;
}

/**
 * DMs the organiser and attendees the moment a booking is made.
 *
 * Unlike the pre-meeting reminder this goes out now, so there is no scheduled message and
 * nothing to cancel later, and no record is kept. A Slack failure must not block the booking,
 * so it only reaches the audit log.
 */
export async function notifyBookingCreated(bookingId: number): Promise<void> {
  const booking = await loadNotifiableBooking(bookingId);
  if (!booking) return;

  const text = [
    getDeploymentT()('dm.meetingBooked'),
    bookingWhen(booking),
    ...bookingDetailLines(booking),
  ].join('\n');

  await Promise.all(
    notifyTargets(booking).map((m) =>
      sendDm(m.slackId, text).catch((err) =>
        logAudit({
          action: 'SLACK_SEND_FAIL',
          target: String(bookingId),
          metadata: { stage: 'room_booking_created', memberId: m.id, error: String(err) },
        }),
      ),
    ),
  );
}

/**
 * Schedules the pre-meeting DM for the organiser and every attendee.
 *
 * Uses Slack's chat.scheduleMessage rather than a cron. When a booking is edited or
 * cancelled, cancelBookingReminders clears these and they are scheduled afresh.
 * A meeting starting sooner than the lead time is skipped, since Slack refuses a time in
 * the past. A Slack failure must not block the booking, so errors only reach the audit log.
 */
export async function scheduleBookingReminders(bookingId: number): Promise<void> {
  const booking = await loadNotifiableBooking(bookingId);
  if (!booking) return;

  const postAt = new Date(booking.startAt.getTime() - REMINDER_LEAD_MINUTES * 60_000);
  if (postAt.getTime() <= Date.now()) return;

  const text = [
    getDeploymentT()('dm.meetingSoon', { minutes: REMINDER_LEAD_MINUTES }),
    bookingWhen(booking),
    ...bookingDetailLines(booking),
  ].join('\n');

  const targets = notifyTargets(booking);

  const scheduled = await Promise.all(
    targets.map(async (m) => {
      try {
        const res = await scheduleDm(m.slackId, text, postAt);
        return res ? { memberId: m.id, ...res } : null;
      } catch (err) {
        await logAudit({
          action: 'SLACK_SEND_FAIL',
          target: String(bookingId),
          metadata: { stage: 'room_reminder_schedule', memberId: m.id, error: String(err) },
        });
        return null;
      }
    }),
  );

  const rows = scheduled.filter((r) => r !== null);
  if (rows.length === 0) return;

  try {
    await prisma.roomBookingReminder.createMany({
      data: rows.map((r) => ({
        bookingId,
        memberId: r.memberId,
        channelId: r.channelId,
        scheduledMessageId: r.scheduledMessageId,
        postAt,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    // If the record cannot be written, the message just scheduled can never be cancelled and
    // would go out even after the meeting is called off. Undo it now, while that is still possible.
    await Promise.all(
      rows.map((r) =>
        cancelScheduledChannel(r.channelId, r.scheduledMessageId).catch(() => {}),
      ),
    );
    await logAudit({
      action: 'SLACK_SEND_FAIL',
      target: String(bookingId),
      metadata: { stage: 'room_reminder_persist', error: String(err) },
    });
  }
}
