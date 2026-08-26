import type { Attendance } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { formatZoned, zonedToday } from './time';
import { logAudit } from './audit';
import { getDeploymentT, getDeploymentLocale } from './i18n/deployment';
import type { MessageKey } from './i18n/dictionary';
import { sendChannel, scheduleChannel, cancelScheduledChannel } from './slack';
import { getAppSettings, workHours } from './settings';
import { DEFAULT_WORK_HOURS, standardWorkMinutes } from './work-hours';

const OPEN_SESSION_UNIQUE_INDEX = 'attendance_sessions_open_unique';
const OPEN_BREAK_UNIQUE_INDEX = 'attendance_breaks_open_unique';

function isOpenSessionConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (target === OPEN_SESSION_UNIQUE_INDEX) return true;
  if (Array.isArray(target) && target.includes(OPEN_SESSION_UNIQUE_INDEX)) return true;
  return false;
}

function isOpenBreakConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (target === OPEN_BREAK_UNIQUE_INDEX) return true;
  if (Array.isArray(target) && target.includes(OPEN_BREAK_UNIQUE_INDEX)) return true;
  return false;
}

export type AttendanceSource = 'web' | 'slack';

export type ClockInResult =
  | {
      ok: true;
      attendance: Attendance;
      reopened: boolean;
      at: Date;
      memberName: string | null;
    }
  | { ok: false; code: 'ALREADY_WORKING'; messageKey: MessageKey };

export type ClockOutResult =
  | { ok: true; attendance: Attendance; at: Date; memberName: string | null }
  | { ok: false; code: 'NO_OPEN_SESSION' | 'ON_BREAK' | 'ON_LUNCH'; messageKey: MessageKey };

export type StartBreakResult =
  | {
      ok: true;
      attendance: Attendance;
      at: Date;
      memberName: string | null;
    }
  | {
      ok: false;
      code: 'NOT_WORKING' | 'ALREADY_ON_BREAK' | 'ALREADY_DONE' | 'ON_LUNCH';
      messageKey: MessageKey;
    };

export type EndBreakResult =
  | { ok: true; attendance: Attendance; at: Date; memberName: string | null }
  | {
      ok: false;
      code: 'NOT_ON_BREAK' | 'ALREADY_WORKING';
      messageKey: MessageKey;
    };

export type StartLunchResult =
  | {
      ok: true;
      attendance: Attendance;
      at: Date;
      endsAt: Date;
      /** The id of the meal break just created. The Slack path uses it to defer scheduling the return notice with after(). */
      breakId: number;
      memberName: string | null;
    }
  | {
      ok: false;
      code: 'NOT_WORKING' | 'ALREADY_ON_BREAK' | 'ALREADY_DONE' | 'ON_LUNCH';
      messageKey: MessageKey;
    };



/**
 * The fixed length of a meal. A meal is stored with its end time already decided, so
 * there is nothing to come back from: once the time passes, work resumes on its own with
 * no job to run. Attendance corrections derive from the same value, so it lives in one place.
 */
export { DEFAULT_MEAL_MINUTES } from './attendance-edit';

/** A meal is in progress when its end time has not yet arrived. */
function lunchInProgressWhere(now: Date) {
  return { kind: 'LUNCH' as const, deletedAt: null, endAt: { gt: now } };
}

type Tx = Prisma.TransactionClient;

/**
 * Locks the session row so that changes to it — clocking out, stepping away, eating —
 * happen one at a time. Checks made outside a transaction cannot stop concurrent requests:
 * if /lunch and /bye overlap, both pass their checks and leave a finished session carrying
 * a meal in the future and a scheduled return notice.
 * After taking this lock you must re-read and re-check the state; the lock does not
 * re-run the checks for you.
 */
export async function lockSession(tx: Tx, sessionId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM attendance_sessions WHERE id = ${sessionId} FOR UPDATE`;
}

/**
 * The re-check taken after the lock: the session is still open, the status is WORKING and
 * no meal is running. Shared by starting a break and starting a meal, which must exclude
 * each other.
 */
async function revalidateWorkingSession(
  tx: Tx,
  sessionId: number,
  now: Date,
): Promise<
  | { ok: true; attendance: Attendance }
  | { ok: false; code: 'NOT_WORKING' | 'ALREADY_ON_BREAK' | 'ALREADY_DONE' | 'ON_LUNCH' }
> {
  const live = await tx.attendanceSession.findFirst({
    where: { id: sessionId, deletedAt: null },
    include: { attendance: true },
  });
  // A filled endAt means a clock-out committed while we were waiting for the lock.
  if (!live || live.endAt) return { ok: false, code: 'NOT_WORKING' };
  const attendance = live.attendance;
  if (attendance.status === 'DONE') return { ok: false, code: 'ALREADY_DONE' };
  if (attendance.status === 'ON_BREAK') return { ok: false, code: 'ALREADY_ON_BREAK' };
  if (attendance.status !== 'WORKING') return { ok: false, code: 'NOT_WORKING' };
  const ongoingLunch = await tx.attendanceBreak.findFirst({
    where: { attendanceId: attendance.id, ...lunchInProgressWhere(now) },
    select: { id: true },
  });
  if (ongoingLunch) return { ok: false, code: 'ON_LUNCH' };
  return { ok: true, attendance };
}

/** The meal this member is currently on, if any. Used to word the reply. */
export async function findOngoingLunch(
  memberId: number,
  now: Date = new Date(),
): Promise<{ startAt: Date; endAt: Date } | null> {
  const row = await prisma.attendanceBreak.findFirst({
    where: {
      ...lunchInProgressWhere(now),
      attendance: { memberId, deletedAt: null },
    },
    orderBy: { startAt: 'desc' },
    select: { startAt: true, endAt: true },
  });
  return row?.endAt ? { startAt: row.startAt, endAt: row.endAt } : null;
}

type SessionTimes = { startAt: Date; endAt: Date | null };
type BreakTimes = { startAt: Date; endAt: Date | null };

/**
 * Worked, break and overtime minutes plus the clock-in (earliest start) and clock-out
 * (latest closed end) for one attendance row. Shared by closing out a day and by approving
 * an attendance correction.
 * - Worked = sum of closed sessions minus sum of closed breaks, clamped at zero.
 * - The status is left alone; that is the caller's job.
 */
export function computeAttendanceTotals(
  sessions: SessionTimes[],
  breaks: BreakTimes[],
  standardMinutes: number = standardWorkMinutes(DEFAULT_WORK_HOURS),
): {
  workedMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  clockInAt: Date | null;
  clockOutAt: Date | null;
} {
  const closedSessions = sessions.filter((s) => s.endAt);
  const sessionMin = closedSessions.reduce(
    (sum, s) => sum + Math.floor((s.endAt!.getTime() - s.startAt.getTime()) / 60000),
    0,
  );
  const breakMin = breaks
    .filter((b) => b.endAt)
    .reduce(
      (sum, b) => sum + Math.floor((b.endAt!.getTime() - b.startAt.getTime()) / 60000),
      0,
    );
  const worked = Math.max(0, sessionMin - breakMin);
  const overtime = Math.max(0, worked - standardMinutes);
  const clockInAt = sessions.reduce<Date | null>(
    (min, s) => (min === null || s.startAt < min ? s.startAt : min),
    null,
  );
  const clockOutAt = closedSessions.reduce<Date | null>(
    (max, s) => (max === null || s.endAt! > max ? s.endAt! : max),
    null,
  );
  return {
    workedMinutes: worked,
    breakMinutes: breakMin,
    overtimeMinutes: overtime,
    clockInAt,
    clockOutAt,
  };
}

export async function notifyChannelIn(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = getDeploymentT()('announce.clockIn', { time: formatZoned(at, 'yyyy.MM.dd(EEEEE) HH:mm', getDeploymentLocale()), name });
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_clock_in', error: String(err) },
    });
  }
}

export async function notifyChannelOut(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = getDeploymentT()('announce.clockOut', { time: formatZoned(at, 'yyyy.MM.dd(EEEEE) HH:mm', getDeploymentLocale()), name });
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_clock_out', error: String(err) },
    });
  }
}

export async function notifyChannelLunch(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = getDeploymentT()('announce.meal', { time: formatZoned(at, 'yyyy.MM.dd(EEEEE) HH:mm', getDeploymentLocale()), name });
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_meal', error: String(err) },
    });
  }
}

export async function notifyChannelBreak(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = getDeploymentT()('announce.away', { time: formatZoned(at, 'yyyy.MM.dd(EEEEE) HH:mm', getDeploymentLocale()), name });
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_away', error: String(err) },
    });
  }
}

/** The wording of a return notice. Shared by the immediate one (coming back from a break) and the scheduled one (a meal ending on its own). */
function buildBackText(name: string, at: Date): string {
  return getDeploymentT()('announce.back', { time: formatZoned(at, 'yyyy.MM.dd(EEEEE) HH:mm', getDeploymentLocale()), name });
}

export async function notifyChannelBack(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = buildBackText(name, at);
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_back', error: String(err) },
    });
  }
}

export async function clockInMember(
  memberId: number,
  source: AttendanceSource,
): Promise<ClockInResult> {
  const now = new Date();
  const date = zonedToday();

  const activeOpen = await prisma.attendanceSession.findFirst({
    where: {
      endAt: null,
      deletedAt: null,
      attendance: { memberId, deletedAt: null },
    },
  });
  if (activeOpen) {
    return { ok: false, code: 'ALREADY_WORKING', messageKey: 'attErr.alreadyWorking' };
  }

  const existing = await prisma.attendance.findFirst({
    where: { memberId, workDate: date, deletedAt: null },
  });

  if (existing && existing.status === 'ON_BREAK') {
    return {
      ok: false,
      code: 'ALREADY_WORKING',
      messageKey: 'attErr.awayUseBack',
    };
  }

  if (existing) {
    let updated: Attendance;
    try {
      updated = await prisma.$transaction(async (tx) => {
        await tx.attendanceSession.create({
          data: { attendanceId: existing.id, startAt: now },
        });
        const minStart =
          existing.clockInAt && existing.clockInAt < now ? existing.clockInAt : now;
        return tx.attendance.update({
          where: { id: existing.id },
          data: {
            status: 'WORKING',
            clockOutAt: null,
            clockInAt: minStart,
          },
        });
      });
    } catch (e) {
      if (isOpenSessionConflict(e)) {
        return { ok: false, code: 'ALREADY_WORKING', messageKey: 'attErr.alreadyWorking' };
      }
      throw e;
    }
    await logAudit({
      actorId: memberId,
      action: 'CLOCK_IN',
      target: String(updated.id),
      metadata: { reopen: true, source },
    });
    const reopenMember = await prisma.member.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { name: true },
    });
    const reopenName = reopenMember?.name ?? null;
    if (source === 'web' && reopenName) {
      await notifyChannelIn(reopenName, now, memberId);
    }
    return {
      ok: true,
      attendance: updated,
      reopened: true,
      at: now,
      memberName: reopenName,
    };
  }

  let created: Attendance;
  try {
    created = await prisma.$transaction(async (tx) => {
      const a = await tx.attendance.create({
        data: {
          memberId,
          workDate: date,
          status: 'WORKING',
          clockInAt: now,
        },
      });
      await tx.attendanceSession.create({
        data: { attendanceId: a.id, startAt: now },
      });
      return a;
    });
  } catch (e) {
    if (isOpenSessionConflict(e)) {
      return { ok: false, code: 'ALREADY_WORKING', messageKey: 'attErr.alreadyWorking' };
    }
    throw e;
  }

  await logAudit({
    actorId: memberId,
    action: 'CLOCK_IN',
    target: String(created.id),
    metadata: { source },
  });
  const m = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
    select: { name: true },
  });
  const name = m?.name ?? null;
  if (source === 'web' && name) {
    await notifyChannelIn(name, now, memberId);
  }
  return {
    ok: true,
    attendance: created,
    reopened: false,
    at: now,
    memberName: name,
  };
}

export async function clockOutMember(
  memberId: number,
  source: AttendanceSource,
): Promise<ClockOutResult> {
  // Someone currently away cannot clock out, whether or not a session is open. Letting a
  // clock-out through while a break is open leaves an orphan — status DONE with a break
  // whose endAt is null — after which both /back and /bye fail and the person is stuck.
  // This matches the web UI's canClockOut === 'WORKING' guard, and blocks Slack /bye the same way.
  //
  // Why this does not test for an open break directly: attendance_breaks_open_unique is a
  // partial unique on session_id, so one member can still hold several open breaks at once
  // (notably the DONE-plus-open-break orphans left behind before that fix). A guard based on
  // open breaks catches those old orphans too, and blocked an ordinary clock-out for someone
  // who was not away at all.
  // Reading attendance.status === ON_BREAK ignores midnight boundaries and excludes orphans,
  // which are DONE, so it identifies only the case meant here: away right now.
  const onBreakAttendance = await prisma.attendance.findFirst({
    where: { memberId, status: 'ON_BREAK', deletedAt: null },
    select: { id: true },
  });
  if (onBreakAttendance) {
    return {
      ok: false,
      code: 'ON_BREAK',
      messageKey: 'attErr.awayBeforeClockOut',
    };
  }

  const open = await prisma.attendanceSession.findFirst({
    where: {
      endAt: null,
      deletedAt: null,
      attendance: { memberId, deletedAt: null },
    },
    orderBy: { startAt: 'desc' },
    include: { attendance: true },
  });
  if (!open) {
    return {
      ok: false,
      code: 'NO_OPEN_SESSION',
      messageKey: 'attErr.noOpenSession',
    };
  }

  const clockOut = new Date();
  // The overtime threshold derives from the org's working hours. Read once, outside the transaction.
  const standardMinutes = standardWorkMinutes(await workHours());

  const outcome = await prisma.$transaction(async (tx) => {
    // Re-check after the lock. /lunch or /break can commit between the earlier check and
    // this transaction, and trusting the unlocked check produces states like "clocked out
    // while still eating".
    await lockSession(tx, open.id);
    const live = await tx.attendanceSession.findFirst({
      where: { id: open.id, deletedAt: null },
      include: { attendance: true },
    });
    if (!live || live.endAt) return { code: 'NO_OPEN_SESSION' as const };
    if (live.attendance.status === 'ON_BREAK') return { code: 'ON_BREAK' as const };
    // No clocking out mid-meal. The meal's end time and its scheduled return notice are
    // already fixed, so allowing it would leave worked time and the notice disagreeing.
    // Cancelling a meal is done by deleting it through an attendance correction.
    const ongoingLunch = await tx.attendanceBreak.findFirst({
      where: { attendanceId: open.attendanceId, ...lunchInProgressWhere(clockOut) },
      select: { id: true },
    });
    if (ongoingLunch) return { code: 'ON_LUNCH' as const };

    await tx.attendanceSession.update({
      where: { id: open.id },
      data: { endAt: clockOut },
    });

    const [allSessions, allBreaks] = await Promise.all([
      tx.attendanceSession.findMany({
        where: { attendanceId: open.attendanceId, deletedAt: null },
        select: { startAt: true, endAt: true },
      }),
      tx.attendanceBreak.findMany({
        where: { attendanceId: open.attendanceId, deletedAt: null },
        select: { startAt: true, endAt: true },
      }),
    ]);
    const totals = computeAttendanceTotals(allSessions, allBreaks, standardMinutes);

    const row = await tx.attendance.update({
      where: { id: open.attendanceId },
      data: {
        clockInAt: totals.clockInAt ?? open.attendance.clockInAt,
        clockOutAt: totals.clockOutAt,
        workedMinutes: totals.workedMinutes,
        breakMinutes: totals.breakMinutes,
        overtimeMinutes: totals.overtimeMinutes,
        status: 'DONE',
      },
    });
    return { updated: row };
  });

  if ('code' in outcome) {
    if (outcome.code === 'ON_BREAK') {
      return {
        ok: false,
        code: 'ON_BREAK',
        messageKey: 'attErr.awayBeforeClockOut',
      };
    }
    if (outcome.code === 'ON_LUNCH') {
      return {
        ok: false,
        code: 'ON_LUNCH',
        messageKey: 'attErr.mealBeforeClockOut',
      };
    }
    return {
      ok: false,
      code: 'NO_OPEN_SESSION',
      messageKey: 'attErr.noOpenSession',
    };
  }
  const updated = outcome.updated;

  await logAudit({
    actorId: memberId,
    action: 'CLOCK_OUT',
    target: String(updated.id),
    metadata: {
      worked: updated.workedMinutes,
      break: updated.breakMinutes,
      overtime: updated.overtimeMinutes,
      source,
    },
  });
  const m = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
    select: { name: true },
  });
  const name = m?.name ?? null;
  if (source === 'web' && name) {
    await notifyChannelOut(name, clockOut, memberId);
  }
  return { ok: true, attendance: updated, at: clockOut, memberName: name };
}

/**
 * Starts a break: creates an open break with no end time, closed later by endBreak().
 * Meals have a fixed end and are a separate thing, created by startLunch() instead.
 */
export async function startBreak(
  memberId: number,
  source: AttendanceSource,
): Promise<StartBreakResult> {
  // Find the open session first and pull its attendance along with it.
  // Looking the attendance up by workDate breaks just after midnight — clock in at 23:30,
  // step away at 00:05 — because it asks for a D+1 row that does not exist and falls through
  // to NOT_WORKING. A member has at most one open session (the attendance_sessions_open_unique
  // partial index) and it is identifiable regardless of the midnight boundary, so we start there.
  const open = await prisma.attendanceSession.findFirst({
    where: {
      endAt: null,
      deletedAt: null,
      attendance: { memberId, deletedAt: null },
    },
    orderBy: { startAt: 'desc' },
    include: { attendance: true },
  });
  if (!open) {
    return { ok: false, code: 'NOT_WORKING', messageKey: 'attErr.clockInFirst' };
  }
  const attendance = open.attendance;
  if (attendance.status === 'DONE') {
    return { ok: false, code: 'ALREADY_DONE', messageKey: 'attErr.alreadyDone' };
  }
  if (attendance.status === 'ON_BREAK') {
    return { ok: false, code: 'ALREADY_ON_BREAK', messageKey: 'attErr.alreadyAway' };
  }
  // With an open session the status should be WORKING. Anything else is inconsistent
  // (NOT_STARTED and friends), and we answer NOT_WORKING to stay on the safe side.
  if (attendance.status !== 'WORKING') {
    return { ok: false, code: 'NOT_WORKING', messageKey: 'attErr.clockInFirst' };
  }

  const at = new Date();
  let outcome:
    | { updated: Attendance }
    | { code: 'NOT_WORKING' | 'ALREADY_ON_BREAK' | 'ALREADY_DONE' | 'ON_LUNCH' };
  try {
    outcome = await prisma.$transaction(async (tx) => {
      // A meal leaves the status at WORKING, so the guard above does not catch it.
      // A break overlapping a meal would subtract the same minutes twice, so we take the
      // same session lock that starting a meal takes and decide again from the post-lock
      // state, making the two paths exclusive. Checks outside the lock let /break and
      // /lunch both through.
      await lockSession(tx, open.id);
      const live = await revalidateWorkingSession(tx, open.id, at);
      if (!live.ok) return { code: live.code };

      await tx.attendanceBreak.create({
        data: {
          attendanceId: live.attendance.id,
          sessionId: open.id,
          startAt: at,
          kind: 'BREAK',
        },
      });
      const row = await tx.attendance.update({
        where: { id: live.attendance.id },
        data: { status: 'ON_BREAK' },
      });
      return { updated: row };
    });
  } catch (e) {
    if (isOpenBreakConflict(e)) {
      return { ok: false, code: 'ALREADY_ON_BREAK', messageKey: 'attErr.alreadyAway' };
    }
    throw e;
  }
  if ('code' in outcome) {
    if (outcome.code === 'ON_LUNCH') {
      return { ok: false, code: 'ON_LUNCH', messageKey: 'attErr.blockedWhileMeal' };
    }
    if (outcome.code === 'ALREADY_ON_BREAK') {
      return { ok: false, code: 'ALREADY_ON_BREAK', messageKey: 'attErr.alreadyAway' };
    }
    if (outcome.code === 'ALREADY_DONE') {
      return { ok: false, code: 'ALREADY_DONE', messageKey: 'attErr.alreadyDone' };
    }
    return { ok: false, code: 'NOT_WORKING', messageKey: 'attErr.clockInFirst' };
  }
  const updated = outcome.updated;

  await logAudit({
    actorId: memberId,
    action: 'BREAK_START',
    target: String(updated.id),
    metadata: { source, at: at.toISOString() },
  });

  const m = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
    select: { name: true },
  });
  const name = m?.name ?? null;
  if (source === 'web' && name) {
    await notifyChannelBreak(name, at, memberId);
  }
  return { ok: true, attendance: updated, at, memberName: name };
}

/**
 * Schedules the Slack "back at their desk" notice for when the meal ends, and stores its id.
 * A failure here leaves the attendance state itself consistent, so callers carry on and only
 * record it in the audit log.
 */
export async function scheduleAutoBack(
  breakId: number,
  memberName: string | null,
  endsAt: Date,
  actorId: number,
): Promise<boolean> {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  // No channel configured, or no name to announce: there was nothing to send, so this is not a failure.
  if (!channel || !memberName) return true;
  try {
    const scheduled = await scheduleChannel(
      channel,
      buildBackText(memberName, endsAt),
      endsAt,
    );
    if (!scheduled) return false;
    try {
      // The id is stored inside the session lock. The Slack path defers this scheduling with
      // after(), and in that window an approved correction can replace the original break.
      // With only a conditional update and no lock, this order slips through — the approval
      // reads the break, we store the id, the approval then deletes that row and schedules
      // its own — and both notices go out.
      // Taking the same session-row lock the approval takes serialises the two updates.
      const saved = await prisma.$transaction(async (tx) => {
        // sessionId survives the row being deleted, so it is safe to lock on.
        const owner = await tx.attendanceBreak.findUnique({
          where: { id: breakId },
          select: { sessionId: true },
        });
        if (!owner) return false;
        await lockSession(tx, owner.sessionId);
        // Re-check after the lock: if the approval committed first, this row is already soft-deleted.
        const live = await tx.attendanceBreak.findFirst({
          where: { id: breakId, deletedAt: null, kind: 'LUNCH' },
          select: { id: true },
        });
        if (!live) return false;
        await tx.attendanceBreak.update({
          where: { id: breakId },
          data: {
            autoBackMessageId: scheduled.scheduledMessageId,
            autoBackChannelId: scheduled.channelId,
          },
        });
        return true;
      });
      if (!saved) {
        // The row we meant to update is gone, so this scheduled message has no owner. Cancel it now.
        await cancelScheduledChannel(scheduled.channelId, scheduled.scheduledMessageId);
        await logAudit({
          actorId,
          action: 'LUNCH_AUTO_BACK_ORPHAN_CANCELLED',
          target: String(breakId),
          metadata: { scheduledMessageId: scheduled.scheduledMessageId },
        });
        return false;
      }
    } catch (err) {
      // Without the stored id the scheduled message can never be cancelled. Undo it now.
      await cancelScheduledChannel(scheduled.channelId, scheduled.scheduledMessageId).catch(
        () => {},
      );
      throw err;
    }
  } catch (err) {
    await logAudit({
      actorId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'lunch_auto_back_schedule', error: String(err) },
    });
    return false;
  }
  return true;
}

/**
 * Cancels scheduled return notices, for when a meal is edited or deleted and its notice
 * would otherwise be orphaned.
 * Slack refuses to cancel anything due within 60 seconds, so this can fail. Swallowing that
 * would let the caller believe it succeeded, schedule a replacement, and send two notices —
 * so this reports whether everything was cancelled. False means an old notice is still live.
 */
export async function cancelAutoBack(
  targets: { autoBackChannelId: string | null; autoBackMessageId: string | null }[],
  actorId: number,
): Promise<boolean> {
  let allCancelled = true;
  for (const t of targets) {
    if (!t.autoBackChannelId || !t.autoBackMessageId) continue;
    try {
      await cancelScheduledChannel(t.autoBackChannelId, t.autoBackMessageId);
    } catch (err) {
      allCancelled = false;
      await logAudit({
        actorId,
        action: 'SLACK_SEND_FAIL',
        metadata: {
          stage: 'lunch_auto_back_cancel',
          scheduledMessageId: t.autoBackMessageId,
          error: String(err),
        },
      });
    }
  }
  return allCancelled;
}

/**
 * Starts a meal. Unlike a break, there is nothing to come back from.
 * Pressing it creates a closed break ending at start + the configured meal length, and
 * leaves attendance.status at WORKING. Work therefore resumes on its own once the time
 * passes, with no job to run, and since no break is left open there is no way to get stuck
 * between coming back and clocking out.
 * "On a meal" is derived from now being before endAt.
 * The only thing scheduled is the Slack return notice, via chat.scheduleMessage.
 */
export async function startLunch(
  memberId: number,
  source: AttendanceSource,
): Promise<StartLunchResult> {
  // Looked up by open session for the reason given in startBreak: the midnight boundary.
  const open = await prisma.attendanceSession.findFirst({
    where: {
      endAt: null,
      deletedAt: null,
      attendance: { memberId, deletedAt: null },
    },
    orderBy: { startAt: 'desc' },
    include: { attendance: true },
  });
  if (!open) {
    return { ok: false, code: 'NOT_WORKING', messageKey: 'attErr.clockInFirst' };
  }
  const attendance = open.attendance;
  if (attendance.status === 'DONE') {
    return { ok: false, code: 'ALREADY_DONE', messageKey: 'attErr.alreadyDone' };
  }
  if (attendance.status === 'ON_BREAK') {
    return {
      ok: false,
      code: 'ALREADY_ON_BREAK',
      messageKey: 'attErr.blockedWhileAway',
    };
  }
  if (attendance.status !== 'WORKING') {
    return { ok: false, code: 'NOT_WORKING', messageKey: 'attErr.clockInFirst' };
  }

  const at = new Date();
  // The current setting applies only to meals starting now. Meals already saved keep their own length.
  const mealMinutes = (await getAppSettings()).mealMinutes;
  const endsAt = new Date(at.getTime() + mealMinutes * 60_000);

  // Several meals a day are fine (lunch, then dinner), so the count is not capped; only
  // overlapping ones are refused. A meal row has its endAt filled in, so it gets no
  // protection from attendance_breaks_open_unique, which covers only rows with a null end.
  // If a double-click, a second tab, or the web and Slack at once slip past the check and
  // create two meals, an hour is wrongly deducted from worked time and two return notices go out.
  // /bye or /break can also commit between that check and this transaction, so after locking
  // the session row we confirm again that it is still open and still WORKING.
  const outcome = await prisma.$transaction(async (tx) => {
    await lockSession(tx, open.id);
    const live = await revalidateWorkingSession(tx, open.id, at);
    if (!live.ok) return { code: live.code };
    const row = await tx.attendanceBreak.create({
      data: {
        attendanceId: live.attendance.id,
        sessionId: open.id,
        startAt: at,
        endAt: endsAt,
        kind: 'LUNCH',
      },
      select: { id: true },
    });
    return { created: row, attendance: live.attendance };
  });
  if ('code' in outcome) {
    if (outcome.code === 'ON_LUNCH') {
      return { ok: false, code: 'ON_LUNCH', messageKey: 'attErr.alreadyOnMeal' };
    }
    if (outcome.code === 'ALREADY_ON_BREAK') {
      return {
        ok: false,
        code: 'ALREADY_ON_BREAK',
        messageKey: 'attErr.blockedWhileAway',
      };
    }
    if (outcome.code === 'ALREADY_DONE') {
      return { ok: false, code: 'ALREADY_DONE', messageKey: 'attErr.alreadyDone' };
    }
    return { ok: false, code: 'NOT_WORKING', messageKey: 'attErr.clockInFirst' };
  }
  const created = outcome.created;

  await logAudit({
    actorId: memberId,
    action: 'LUNCH_START',
    target: String(attendance.id),
    metadata: { source, at: at.toISOString(), endsAt: endsAt.toISOString() },
  });

  const m = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
    select: { name: true },
  });
  const name = m?.name ?? null;

  if (source === 'web') {
    // A Slack slash command has a three-second budget to acknowledge, so the caller defers this with after().
    await scheduleAutoBack(created.id, name, endsAt, memberId);
    if (name) await notifyChannelLunch(name, at, memberId);
  }
  return {
    ok: true,
    attendance: outcome.attendance,
    at,
    endsAt,
    breakId: created.id,
    memberName: name,
  };
}

export async function endBreak(
  memberId: number,
  source: AttendanceSource,
): Promise<EndBreakResult> {
  // Find the open break first. Looking it up by workDate fails just after midnight, when
  // coming back cannot find yesterday's row, so we identify it through the
  // attendance_breaks_open_unique partial index instead, which is independent of the
  // midnight boundary.
  const openBreak = await prisma.attendanceBreak.findFirst({
    where: {
      endAt: null,
      deletedAt: null,
      attendance: { memberId, deletedAt: null },
    },
    orderBy: { startAt: 'desc' },
    include: { attendance: true },
  });
  if (!openBreak) {
    return {
      ok: false,
      code: 'NOT_ON_BREAK',
      messageKey: 'attErr.notAway',
    };
  }
  const attendance = openBreak.attendance;
  if (attendance.status !== 'ON_BREAK') {
    // An orphan: an open break exists but the attendance is not ON_BREAK. This is data left
    // behind before the fix, where Slack /bye went through while someone was on a break, closed
    // the day as DONE, and left the break open.
    // The current clockOutMember refuses with ON_BREAK whenever an open break exists, so left
    // alone both /back and /bye fail and the person cannot recover on their own. Closing the
    // break at attendance.clockOutAt, which exists once the day is DONE, breaks the deadlock.
    // The stored workedMinutes and breakMinutes are already wrong; recomputing them is left to
    // a separate admin step, and the audit log makes it traceable.
    // If clockOutAt were somehow earlier than the break's start the duration would go negative,
    // so it is clamped to startAt. Whether the clamp fired is visible by comparing breakStartAt
    // and endAt in the audit metadata.
    const clockOutMs = attendance.clockOutAt?.getTime() ?? Date.now();
    const cleanupEnd = new Date(Math.max(openBreak.startAt.getTime(), clockOutMs));
    await prisma.attendanceBreak.update({
      where: { id: openBreak.id },
      data: { endAt: cleanupEnd },
    });
    await logAudit({
      actorId: memberId,
      action: 'BREAK_END_ORPHAN_CLEANUP',
      target: String(openBreak.id),
      metadata: {
        source,
        attendanceId: attendance.id,
        attendanceStatus: attendance.status,
        breakStartAt: openBreak.startAt.toISOString(),
        endAt: cleanupEnd.toISOString(),
        usedAttendanceClockOutAt: attendance.clockOutAt !== null,
      },
    });
    // From the user's side this reads the same as an ordinary NOT_ON_BREAK.
    return {
      ok: false,
      code: 'NOT_ON_BREAK',
      messageKey: 'attErr.notAway',
    };
  }

  const at = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.attendanceBreak.update({
      where: { id: openBreak.id },
      data: { endAt: at },
    });
    return tx.attendance.update({
      where: { id: attendance.id },
      data: { status: 'WORKING' },
    });
  });

  await logAudit({
    actorId: memberId,
    action: 'BREAK_END',
    target: String(updated.id),
    metadata: { source, at: at.toISOString() },
  });

  const m = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
    select: { name: true },
  });
  const name = m?.name ?? null;
  if (source === 'web' && name) {
    await notifyChannelBack(name, at, memberId);
  }
  return { ok: true, attendance: updated, at, memberName: name };
}
