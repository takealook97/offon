import { prisma } from './prisma';

/**
 * How many approvals are waiting: leave requests plus attendance corrections.
 *
 * The conditions have to match the pending list on the approvals screen. If the badge and the
 * list disagree, the red dot is showing and the page is empty.
 * → src/app/(app)/admin/approvals/page.tsx
 */
export async function countPendingApprovals(): Promise<number> {
  const [leaves, edits] = await Promise.all([
    prisma.leaveRequest.count({
      where: { status: 'REQUESTED', deletedAt: null },
    }),
    prisma.attendanceEditRequest.count({
      where: { status: 'REQUESTED', deletedAt: null },
    }),
  ]);
  return leaves + edits;
}
