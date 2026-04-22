import type { Attendance } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { formatKST, todayKST } from './time';
import { logAudit } from './audit';
import { sendChannel } from './slack';

const OPEN_SESSION_UNIQUE_INDEX = 'attendance_sessions_open_unique';

function isOpenSessionConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (target === OPEN_SESSION_UNIQUE_INDEX) return true;
  if (Array.isArray(target) && target.includes(OPEN_SESSION_UNIQUE_INDEX)) return true;
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
  | { ok: false; code: 'NO_OPEN_SESSION'; error: string };

const STANDARD_MINUTES = 480;
const LUNCH_DEDUCTION_THRESHOLD_MINUTES = 300;
const LUNCH_DEDUCTION_MINUTES = 60;

export async function notifyChannelIn(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = `${formatKST(at, 'yyyy.MM.dd(EEEEE) HH:mm')}\n${name}님이 출근하셨습니다☀️`;
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_출근', error: String(err) },
    });
  }
}

export async function notifyChannelOut(name: string, at: Date, memberId: number) {
  const channel = process.env.SLACK_OFFON_CHANNEL;
  if (!channel) return;
  const text = `${formatKST(at, 'yyyy.MM.dd(EEEEE) HH:mm')}\n${name}님이 퇴근하셨습니다🌙`;
  try {
    await sendChannel(channel, text);
  } catch (err) {
    await logAudit({
      actorId: memberId,
      action: 'SLACK_SEND_FAIL',
      metadata: { stage: 'channel_퇴근', error: String(err) },
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
    return { ok: false, code: 'ALREADY_WORKING', error: '이미 근무 중입니다' };
  }

  const existing = await prisma.attendance.findUnique({
    where: { memberId_workDate: { memberId, workDate: date } },
  });

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
        return { ok: false, code: 'ALREADY_WORKING', error: '이미 근무 중입니다' };
      }
      throw e;
    }
    await logAudit({
      actorId: memberId,
      action: 'CLOCK_IN',
      target: String(updated.id),
      metadata: { reopen: true, source },
    });
    const reopenMember = await prisma.member.findUnique({
      where: { id: memberId },
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
      return { ok: false, code: 'ALREADY_WORKING', error: '이미 근무 중입니다' };
    }
    throw e;
  }

  await logAudit({
    actorId: memberId,
    action: 'CLOCK_IN',
    target: String(created.id),
    metadata: { source },
  });
  const m = await prisma.member.findUnique({
    where: { id: memberId },
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
      error: '진행 중인 근무 세션이 없습니다',
    };
  }

  const clockOut = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.attendanceSession.update({
      where: { id: open.id },
      data: { endAt: clockOut },
    });
    const all = await tx.attendanceSession.findMany({
      where: { attendanceId: open.attendanceId, deletedAt: null },
      select: { startAt: true, endAt: true },
    });
    const closed = all.filter((s) => s.endAt);
    const rawWorked = closed.reduce(
      (sum, s) => sum + Math.floor((s.endAt!.getTime() - s.startAt.getTime()) / 60000),
      0,
    );
    const worked =
      rawWorked >= LUNCH_DEDUCTION_THRESHOLD_MINUTES
        ? rawWorked - LUNCH_DEDUCTION_MINUTES
        : rawWorked;
    const overtime = Math.max(0, worked - STANDARD_MINUTES);
    const minStart = all.reduce<Date | null>(
      (min, s) => (min === null || s.startAt < min ? s.startAt : min),
      null,
    );
    const maxEnd = closed.reduce<Date | null>(
      (max, s) => (max === null || s.endAt! > max ? s.endAt! : max),
      null,
    );
    return tx.attendance.update({
      where: { id: open.attendanceId },
      data: {
        clockInAt: minStart ?? open.attendance.clockInAt,
        clockOutAt: maxEnd,
        workedMinutes: worked,
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
      overtime: updated.overtimeMinutes,
      source,
    },
  });
  const m = await prisma.member.findUnique({
    where: { id: memberId },
    select: { name: true },
  });
  const name = m?.name ?? null;
  if (source === 'web' && name) {
    await notifyChannelOut(name, clockOut, memberId);
  }
  return { ok: true, attendance: updated, at: clockOut, memberName: name };
}
