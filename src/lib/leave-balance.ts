import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * The two places a leave balance moves.
 *
 * This arithmetic is somebody's leave, so it does not live in a route. Subtracting too much
 * on approval loses days they never took; returning too little on cancellation loses them just the same.
 *
 * The status change and the balance move belong in one transaction. Apart, they leave
 * either an approved request that was never deducted or a deduction against a request still
 * pending, and neither is visible from the screen.
 */

/** Approves the request and takes those days out of the balance. `days` is the count recomputed at approval. */
export async function applyLeaveApproval(
  requestId: number,
  approverId: number,
  days: Prisma.Decimal,
): Promise<{ memberId: number }> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', approverId, days },
    });
    await tx.leaveBalance.update({
      where: { memberId: updated.memberId },
      data: { usedDays: { increment: days } },
    });
    return { memberId: updated.memberId };
  });
}

/**
 * Cancels the request, returning the days if it had already been approved and deducted.
 *
 * A request still pending was never deducted, so there is nothing to give back. Returning
 * unconditionally would hand out leave that was never spent.
 */
export async function applyLeaveCancellation(
  requestId: number,
): Promise<{ memberId: number; previousStatus: string; restored: boolean }> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.leaveRequest.findUniqueOrThrow({ where: { id: requestId } });
    const previousStatus = target.status;

    await tx.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });

    const restored = previousStatus === 'APPROVED';
    if (restored) {
      await tx.leaveBalance.update({
        where: { memberId: target.memberId },
        data: { usedDays: { decrement: target.days } },
      });
    }

    return { memberId: target.memberId, previousStatus, restored };
  });
}
