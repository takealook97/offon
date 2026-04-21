import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { listHolidays } from '@/lib/holidays';
import { logAudit } from '@/lib/audit';

const CreateBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(100),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const holidays = await listHolidays({ from, to });
    return NextResponse.json({ ok: true, holidays });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'That input is not valid' },
        { status: 400 },
      );
    }
    const { date, name } = parsed.data;
    try {
      const row = await prisma.holiday.create({
        data: { date: new Date(`${date}T00:00:00Z`), name },
      });
      await logAudit({
        actorId: admin.memberId,
        action: 'HOLIDAY_CREATE',
        target: String(row.id),
        metadata: { date, name },
      });
      return NextResponse.json({
        ok: true,
        holiday: { id: row.id, date, name: row.name },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return NextResponse.json(
          { ok: false, error: 'That date is already registered' },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
