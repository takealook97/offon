import { prisma } from './prisma';
import { formatKST } from './time';
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
