import type { Attendance } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { formatKST, todayKST } from './time';
import { logAudit } from './audit';
import { sendChannel } from './slack';

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
  | { ok: false; code: 'ALREADY_WORKING'; error: string };

export type ClockOutResult =
  | { ok: true; attendance: Attendance; at: Date; memberName: string | null }
  | { ok: false; code: 'NO_OPEN_SESSION' | 'ON_BREAK'; error: string };

export type BreakKind = 'lunch' | 'break';

export type StartBreakResult =
  | {
      ok: true;
      attendance: Attendance;
      at: Date;
      memberName: string | null;
      kind: BreakKind;
    }
  | {
      ok: false;
      code: 'NOT_WORKING' | 'ALREADY_ON_BREAK' | 'ALREADY_DONE';
      error: string;
    };

export type EndBreakResult =
  | { ok: true; attendance: Attendance; at: Date; memberName: string | null }
  | {
      ok: false;
      code: 'NOT_ON_BREAK' | 'ALREADY_WORKING';
      error: string;
    };

// Maps the stored enum to the external interface
function toPrismaBreakKind(kind: BreakKind): 'BREAK' | 'LUNCH' {
  return kind === 'lunch' ? 'LUNCH' : 'BREAK';
}

const STANDARD_MINUTES = 480;

export async function notifyChannelIn(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = `${formatKST(at, 'yyyy.MM.dd(EEEEE) HH:mm')}\n${name} clocked in\u2600\ufe0f`;
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_Clock in', error: String(err) },
    });
  }
}

export async function notifyChannelOut(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = `${formatKST(at, 'yyyy.MM.dd(EEEEE) HH:mm')}\n${name} clocked out\ud83c\udf19`;
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_Clock out', error: String(err) },
    });
  }
}

export async function notifyChannelLunch(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = `${formatKST(at, 'yyyy.MM.dd(EEEEE) HH:mm')}\n${name} went for a meal\ud83c\udf7d\ufe0f`;
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_Meal', error: String(err) },
    });
  }
}

export async function notifyChannelBreak(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = `${formatKST(at, 'yyyy.MM.dd(EEEEE) HH:mm')}\n${name} stepped away\u23f8\ufe0f`;
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_Away', error: String(err) },
    });
  }
}

export async function notifyChannelBack(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = `${formatKST(at, 'yyyy.MM.dd(EEEEE) HH:mm')}\n${name} is back\u25b6\ufe0f`;
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_Back', error: String(err) },
    });
  }
}

export async function clockInMember(
  memberId: number,
  source: AttendanceSource,
): Promise<ClockInResult> {
  const now = new Date();
  const date = todayKST();

  const activeOpen = await prisma.attendanceSession.findFirst({
    where: {
      endAt: null,
      deletedAt: null,
      attendance: { memberId, deletedAt: null },
    },
  });
  if (activeOpen) {
    return { ok: false, code: 'ALREADY_WORKING', error: 'You are already clocked in' };
  }

  const existing = await prisma.attendance.findFirst({
    where: { memberId, workDate: date, deletedAt: null },
  });

  if (existing && existing.status === 'ON_BREAK') {
    return {
      ok: false,
      code: 'ALREADY_WORKING',
      error: 'You are away. Use the back command',
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
        return { ok: false, code: 'ALREADY_WORKING', error: 'You are already clocked in' };
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
      return { ok: false, code: 'ALREADY_WORKING', error: 'You are already clocked in' };
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
      error: 'You are away. Come back before clocking out',
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
      error: 'No work session is open',
    };
  }

  const clockOut = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.attendanceSession.update({
      where: { id: open.id },
      data: { endAt: clockOut },
    });
    const allSessions = await tx.attendanceSession.findMany({
      where: { attendanceId: open.attendanceId, deletedAt: null },
      select: { startAt: true, endAt: true },
    });
    const closedSessions = allSessions.filter((s) => s.endAt);
    const sessionMin = closedSessions.reduce(
      (sum, s) => sum + Math.floor((s.endAt!.getTime() - s.startAt.getTime()) / 60000),
      0,
    );

    const closedBreaks = await tx.attendanceBreak.findMany({
      where: {
        attendanceId: open.attendanceId,
        deletedAt: null,
        endAt: { not: null },
      },
      select: { startAt: true, endAt: true },
    });
    const breakMin = closedBreaks.reduce(
      (sum, b) => sum + Math.floor((b.endAt!.getTime() - b.startAt.getTime()) / 60000),
      0,
    );

    const worked = Math.max(0, sessionMin - breakMin);
    const overtime = Math.max(0, worked - STANDARD_MINUTES);

    const minStart = allSessions.reduce<Date | null>(
      (min, s) => (min === null || s.startAt < min ? s.startAt : min),
      null,
    );
    const maxEnd = closedSessions.reduce<Date | null>(
      (max, s) => (max === null || s.endAt! > max ? s.endAt! : max),
      null,
    );

    return tx.attendance.update({
      where: { id: open.attendanceId },
      data: {
        clockInAt: minStart ?? open.attendance.clockInAt,
        clockOutAt: maxEnd,
        workedMinutes: worked,
        breakMinutes: breakMin,
        overtimeMinutes: overtime,
        status: 'DONE',
      },
    });
  });

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

export async function startBreak(
  memberId: number,
  source: AttendanceSource,
  kind: BreakKind = 'break',
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
    return { ok: false, code: 'NOT_WORKING', error: 'Clock in first' };
  }
  const attendance = open.attendance;
  if (attendance.status === 'DONE') {
    return { ok: false, code: 'ALREADY_DONE', error: 'Today is already finished' };
  }
  if (attendance.status === 'ON_BREAK') {
    return { ok: false, code: 'ALREADY_ON_BREAK', error: 'You are already marked away' };
  }
  // With an open session the status should be WORKING. Anything else is inconsistent
  // (NOT_STARTED and friends), and we answer NOT_WORKING to stay on the safe side.
  if (attendance.status !== 'WORKING') {
    return { ok: false, code: 'NOT_WORKING', error: 'Clock in first' };
  }

  const at = new Date();
  let updated: Attendance;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await tx.attendanceBreak.create({
        data: {
          attendanceId: attendance.id,
          sessionId: open.id,
          startAt: at,
          kind: toPrismaBreakKind(kind),
        },
      });
      return tx.attendance.update({
        where: { id: attendance.id },
        data: { status: 'ON_BREAK' },
      });
    });
  } catch (e) {
    if (isOpenBreakConflict(e)) {
      return { ok: false, code: 'ALREADY_ON_BREAK', error: 'You are already marked away' };
    }
    throw e;
  }

  await logAudit({
    actorId: memberId,
    action: 'BREAK_START',
    target: String(updated.id),
    metadata: { source, kind, at: at.toISOString() },
  });

  const m = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
    select: { name: true },
  });
  const name = m?.name ?? null;
  if (source === 'web' && name) {
    if (kind === 'lunch') await notifyChannelLunch(name, at, memberId);
    else await notifyChannelBreak(name, at, memberId);
  }
  return { ok: true, attendance: updated, at, memberName: name, kind };
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
      error: 'You are not marked away',
    };
  }
  const attendance = openBreak.attendance;
  if (attendance.status !== 'ON_BREAK') {
    // An orphan: an open break exists but the attendance does not say away.
    // Data left behind before the fix, where a clock-out went through while someone was on a break,
    //  leaving the break open.
    // Clocking out now refuses whenever an open break exists, so left alone both coming back and clocking out
    // both fail and the person cannot recover on their own. Closing the break at the recorded clock-out
    // breaks the deadlock. The stored worked and break minutes are already wrong,
    // but recomputing them is left to a separate admin step, and the audit log makes it traceable.
    // If the recorded clock-out were somehow earlier than the break start the duration would go negative,
    // so it is clamped to the break start. Whether the clamp fired
    // can be traced by comparing the two in the audit metadata.
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
      error: 'You are not marked away',
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
