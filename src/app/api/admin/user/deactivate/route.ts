import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { logAudit } from '@/lib/audit';

const Body = z.object({
  id: z.coerce.number().int(),
  active: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: '입력이 올바르지 않습니다' }, { status: 400 });
    }
    const { id, active } = parsed.data;
    await prisma.member.update({
      where: { id },
      data: { deletedAt: active ? null : new Date() },
    });
    await logAudit({
      actorId: admin.memberId,
      action: active ? 'MEMBER_REACTIVATE' : 'MEMBER_DEACTIVATE',
      target: String(id),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
