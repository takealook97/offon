import type { Prisma } from '@prisma/client';

/**
 * The shared filter for counting leave used.
 *
 * The day count is stored regardless of category,
 * so a public-duty record also carries a non-zero value. But for the balance and the reports,
 * so anything counting days that actually come out of the balance
 * has to be narrowed. Spreading the constant below avoids missing one.
 *
 * For example:
 *   prisma.leaveRequest.aggregate({
 *     where: { ...ANNUAL_USAGE_FILTER, memberId, status: 'REQUESTED' },
 *     _sum: { days: true },
 *   });
 */
export const ANNUAL_USAGE_FILTER = {
  category: 'ANNUAL',
  deletedAt: null,
} satisfies Prisma.LeaveRequestWhereInput;
