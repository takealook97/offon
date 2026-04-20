import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const memberId = req.nextUrl.searchParams.get('memberId') ?? undefined;
    const start = req.nextUrl.searchParams.get('start');
    const end = req.nextUrl.searchParams.get('end');
    const where = {
      deletedAt: null,
      ...(memberId ? { memberId } : {}),
      ...(start && end
        ? { workDate: { gte: new Date(start), lte: new Date(end) } }
        : {}),
    };
    const rows = await prisma.attendance.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { memberId: 'asc' }],
      include: { member: { select: { name: true, email: true } } },
      take: 500,
    });
    return NextResponse.json({ attendances: rows });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
