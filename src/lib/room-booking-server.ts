import { prisma } from './prisma';
import { logAudit } from './audit';
import { cancelScheduledChannel, scheduleDm } from './slack';
import { formatKST } from './time';
import { MEETING_TYPE_LABEL } from './room-booking';
import type { RoomBookingDTO } from './api-types';

/**
 * Server-only helpers shared by the meeting-room route handlers.
 * Next's route.ts allows no exports beyond the HTTP methods, hence a separate file.
 * The time rules and overlap checks themselves live in room-booking.ts, which the front end shares.
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
 * A stored row as the DTO the client sees. canManage means the organiser or an admin.
 * People who have left are marked inactive rather than removed, so the record stays true to what happened.
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
 * The interval is half-open, so bookings that merely touch do not clash.
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
  const range = `${formatKST(conflict.startAt, 'HH:mm')}~${formatKST(conflict.endAt, 'HH:mm')}`;
  return `That slot is already booked (${range} ${conflict.title})`;
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
export const REMINDER_LEAD_MINUTES = 10;

/**
 * Cancels every pre-meeting DM scheduled for a booking and clears the records.
 *
 * Slack refuses to cancel anything due within 60 seconds, so individual failures are swallowed.
 * A notice already sent cannot be recalled, and failing the edit or cancellation because of it would be worse.
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

/**
 * Schedules the pre-meeting DM for the organiser and every attendee.
 *
 * Uses Slack's chat.scheduleMessage rather than a cron. When a booking is edited or
 * cancelled, cancelBookingReminders clears these and they are scheduled afresh.
 * A meeting starting sooner than the lead time is skipped, since Slack refuses a time in the past.
 * the past. A Slack failure must not block the booking, so errors only reach the audit log.
 */
export async function scheduleBookingReminders(bookingId: number): Promise<void> {
  const booking = await prisma.roomBooking.findFirst({
    where: { id: bookingId, status: 'CONFIRMED', deletedAt: null },
    include: {
      room: { select: { name: true } },
      member: { select: { id: true, name: true, slackId: true, deletedAt: true } },
      attendees: {
        include: {
          member: { select: { id: true, name: true, slackId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!booking) return;

  const postAt = new Date(booking.startAt.getTime() - REMINDER_LEAD_MINUTES * 60_000);
  if (postAt.getTime() <= Date.now()) return;

  const attendeeNames = booking.attendees.map((a) => a.member.name);
  const text = [
    `Your meeting starts in ${REMINDER_LEAD_MINUTES} minutes.`,
    '',
    `- Subject : ${booking.title}`,
    `- Type : ${MEETING_TYPE_LABEL[booking.type]}`,
    `- Attendees: ${attendeeNames.length > 0 ? attendeeNames.join(', ') : 'none'}`,
  ].join('\n');

  // The organiser is reminded of their own meeting, so a booking with no attendees still reminds someone.
  const targets = [booking.member, ...booking.attendees.map((a) => a.member)].filter(
    (m, idx, all) => m.deletedAt === null && all.findIndex((x) => x.id === m.id) === idx,
  );

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
