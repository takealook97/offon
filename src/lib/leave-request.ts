import { prisma } from './prisma';

/**
 * The two things that decide whether leave can be requested: is any left, and does it clash.
 *
 * They live here rather than in the route because both fail badly in either direction.
 * Counting the balance generously lets someone request leave they do not have; missing a
 * clash gets two requests approved for the same day and takes it out of the balance twice.
 */

export type LeaveBalanceRow = {
  baseDays: unknown;
  bonusDays: unknown;
  usedDays: unknown;
} | null;

/**
 * How many days can be requested right now.
 *
 * Pending requests are subtracted too: not yet approved, but already spoken for. Without
 * that, the same balance funds two requests, both get approved, and it goes negative.
 */
export function availableLeaveDays(balance: LeaveBalanceRow, pendingDays: number): number {
  const base = balance ? Number(balance.baseDays) : 0;
  const bonus = balance ? Number(balance.bonusDays) : 0;
  const used = balance ? Number(balance.usedDays) : 0;
  return base + bonus - used - pendingDays;
}

/** Reads the balance row and the pending total to work out what can be requested. */
export async function remainingLeaveFor(memberId: number): Promise<number> {
  const [balance, pending] = await Promise.all([
    prisma.leaveBalance.findFirst({ where: { memberId, deletedAt: null } }),
    prisma.leaveRequest.aggregate({
      where: { memberId, status: 'REQUESTED', deletedAt: null },
      _sum: { days: true },
    }),
  ]);
  return availableLeaveDays(balance, pending._sum.days ? Number(pending._sum.days) : 0);
}

/**
 * A request already covering the same dates. Only pending and approved ones count;
 * cancelled and rejected requests do not hold a date.
 */
export async function findOverlappingLeave(
  memberId: number,
  startDate: string,
  endDate: string,
) {
  return prisma.leaveRequest.findFirst({
    where: {
      memberId,
      status: { in: ['REQUESTED', 'APPROVED'] },
      deletedAt: null,
      startDate: { lte: new Date(endDate) },
      endDate: { gte: new Date(startDate) },
    },
    select: { startDate: true, endDate: true, type: true, status: true },
  });
}

/** The clashing request as a range to show someone. A single day reads as one date, with no dash. */
export function overlapRangeLabel(overlap: { startDate: Date; endDate: Date }): string {
  const start = overlap.startDate.toISOString().slice(0, 10);
  const end = overlap.endDate.toISOString().slice(0, 10);
  return start === end ? start : `${start}~${end}`;
}
