import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';

export async function GET() {
  try {
    await requireSession();
    const members = await prisma.member.findMany({
      where: { deletedAt: null },
      orderBy: [{ role: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true, role: true },
    });
    return NextResponse.json({ members });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
