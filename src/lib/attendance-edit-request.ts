import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { dayKey } from './time';

/**
 * The rules deciding whether an attendance correction can be **accepted** at all.
 *
 * Whether the timeline itself makes sense is `attendance-edit.ts`'s job. What lives here
 * comes before that: is this session in a state to accept a correction, is one already
 * waiting, and does the proposed clock-in still fall on the work date.
 *
 * Inside the route these decisions were tangled up with building a NextResponse, so nothing could reach them.
 */

/**
 * No correction is accepted while someone is away, i.e. while a break is still open.
 *
 * An unfinished span has no length yet, so it cannot go into the proposed timeline. Ignoring
 * it means the approved timeline disagrees with reality once the person comes back. They can
 * make the correction then.
 *
 * A meal is a closed span, with its end fixed the moment it starts, so it does not trip this.
 * Even a meal in progress can be corrected or removed.
 */
export function isAwayNow(breaks: readonly { endAt: Date | null }[]): boolean {
  return breaks.some((b) => !b.endAt);
}

/**
 * The lengths, in minutes, of the meals **already saved** on this session.
 *
 * An allow-list that stops an unrelated meal from quietly shrinking to 45 minutes when the
 * setting changes from 60 to 45 and someone corrects only an old clock-out. A record holds
 * both its start and its end, so it describes its own length.
 */
export function storedMealMinutes(
  breaks: readonly { startAt: Date; endAt: Date | null; kind?: string }[],
): number[] {
  return breaks
    .filter((b) => b.kind === 'LUNCH' && b.endAt)
    .map((b) => Math.round((b.endAt!.getTime() - b.startAt.getTime()) / 60_000));
}

/**
 * Whether the proposed clock-in still falls on the same day as the work date.
 *
 * Moving it to another day contradicts attendance.workDate, which robs
 * `@@unique([memberId, workDate])` of its meaning and points the missing-record reminders at
 * the wrong day. The comparison is made in the org timezone: a clock-in at 23:00 must not
 * roll into tomorrow just because the server runs in UTC.
 *
 * A clock-out crossing midnight is supported, so only the clock-in's date is checked.
 */
export function clockInMatchesWorkDate(startAtIso: string, workDate: Date): boolean {
  return dayKey(new Date(startAtIso)) === dayKey(workDate);
}

const PENDING_UNIQUE_INDEX = 'attendance_edit_requests_pending_unique';
const PENDING_UNIQUE_COLUMN = 'session_id';

/**
 * Whether a create hit the partial unique index allowing one pending request per session.
 *
 * There is a gap between the lookup and the create. A double-click or two concurrent
 * requests slip through it, both passing the lookup, and the database stops the second.
 * This tells that clash apart from any other P2002, so only a genuine duplicate answers 409.
 *
 * On Postgres, Prisma reports the **column** (`session_id`) as the target, not the index
 * name. The earlier version looked only for the name and therefore never matched once: the
 * request that lost the race fell through to a 500, and the person who double-clicked saw a
 * server error instead of being told to try again shortly.
 * This partial index is the only unique constraint on session_id in this table, so the
 * column identifies it. The name is still accepted so a change of driver cannot quietly
 * undo the fix.
 */
export function isPendingConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== 'P2002') return false;
  if (e.meta?.modelName && e.meta.modelName !== 'AttendanceEditRequest') return false;

  const target = e.meta?.target;
  const names = typeof target === 'string' ? [target] : Array.isArray(target) ? target : [];
  return names.includes(PENDING_UNIQUE_INDEX) || names.includes(PENDING_UNIQUE_COLUMN);
}

/** A correction already waiting on this session. Cancelled, rejected and deleted ones do not count. */
export async function findPendingEditRequest(
  sessionId: number,
): Promise<{ id: number } | null> {
  return prisma.attendanceEditRequest.findFirst({
    where: { sessionId, status: 'REQUESTED', deletedAt: null },
    select: { id: true },
  });
}
