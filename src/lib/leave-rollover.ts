import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logAudit } from './audit';
import { zonedMonthDay, zonedYear } from './time';
import { isRolloverWindow, nextBaseDays } from './leave';

export type RolloverResult =
  | { ok: true; skipped: 'out_of_window'; year: number; month: number; day: number }
  | { ok: true; year: number; total: number; processed: number; failed: number };

/**
 * Replaces everyone's leave balance with the new year's when the year turns over.
 *
 * It lives here rather than in the route so it can be tested. It overwrites everyone's
 * balance once a year, and getting that wrong takes a long time to notice and is hard to undo.
 *
 * Safe to run again. It selects only rows whose rolloverYear is behind and raises each to the
 * current year as it goes, so a scheduler waking twice in one week does not apply it twice.
 *
 * One person failing does not stop the rest: everybody starting the year without their leave,
 * because of a single row, would be far worse.
 */
export async function runLeaveRollover(now: Date = new Date()): Promise<RolloverResult> {
  const { month, day } = zonedMonthDay(now);
  const year = zonedYear(now);

  if (!isRolloverWindow(month, day)) {
    await logAudit({
      action: 'LEAVE_ROLLOVER_SKIP',
      metadata: { reason: 'out_of_window', year, month, day },
    });
    return { ok: true, skipped: 'out_of_window', year, month, day };
  }

  const targets = await prisma.leaveBalance.findMany({
    where: {
      rolloverYear: { lt: year },
      deletedAt: null,
      member: { deletedAt: null },
    },
  });

  let processed = 0;
  let failed = 0;

  for (const b of targets) {
    const newBase = nextBaseDays(Number(b.baseDays));
    const before = {
      baseDays: b.baseDays.toString(),
      bonusDays: b.bonusDays.toString(),
      usedDays: b.usedDays.toString(),
      rolloverYear: b.rolloverYear,
    };
    try {
      await prisma.$transaction(async (tx) => {
        await tx.leaveBalance.update({
          where: { id: b.id },
          data: {
            baseDays: new Prisma.Decimal(newBase),
            bonusDays: new Prisma.Decimal(0),
            usedDays: new Prisma.Decimal(0),
            rolloverYear: year,
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'LEAVE_ROLLOVER',
            target: String(b.memberId),
            metadata: {
              year,
              before,
              after: { baseDays: newBase, bonusDays: 0, usedDays: 0, rolloverYear: year },
            },
          },
        });
      });
      processed++;
    } catch (err) {
      await logAudit({
        action: 'LEAVE_ROLLOVER_FAIL',
        target: String(b.memberId),
        metadata: { year, before, error: String(err) },
      });
      failed++;
    }
  }

  return { ok: true, year, total: targets.length, processed, failed };
}
