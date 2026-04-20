import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { logAudit } from '@/lib/audit';

const Body = z.object({ id: z.string().min(1) });

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'That input is not valid' }, { status: 400 });
    }
    await prisma.member.update({
      where: { id: parsed.data.id },
      data: { active: false, deletedAt: new Date() },
    });
    await logAudit({ actorId: admin.sub, action: 'MEMBER_DEACTIVATE', target: parsed.data.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
