import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id: raw } = await params;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Invalid id' },
        { status: 400 },
      );
    }
    const existing = await prisma.holiday.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'Not found' },
        { status: 404 },
      );
    }
    await prisma.holiday.delete({ where: { id } });
    await logAudit({
      actorId: admin.memberId,
      action: 'HOLIDAY_DELETE',
      target: String(id),
      metadata: {
        date: existing.date.toISOString().slice(0, 10),
        name: existing.name,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
