import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkCronAuth } from '@/lib/cron-auth';
import { kstMonthDay, kstYear } from '@/lib/time';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const ROLLOVER_WINDOW_MAX_DAY = 7;
const BASE_DEFAULT = 15;

export async function GET(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason },
      { status: auth.reason === 'misconfigured' ? 500 : 401 },
    );
  }

  const now = new Date();
  const { month, day } = kstMonthDay(now);
  const year = kstYear(now);

  if (month !== 1 || day > ROLLOVER_WINDOW_MAX_DAY) {
    await logAudit({
      action: 'LEAVE_ROLLOVER_SKIP',
      metadata: { reason: 'out_of_window', year, month, day },
    });
    return NextResponse.json({
      ok: true,
      skipped: 'out_of_window',
      year,
      month,
      day,
    });
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
    const base = Number(b.baseDays);
    const newBase = base >= BASE_DEFAULT ? base + 1 : BASE_DEFAULT;
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

  return NextResponse.json({
    ok: true,
    year,
    total: targets.length,
    processed,
    failed,
  });
}
