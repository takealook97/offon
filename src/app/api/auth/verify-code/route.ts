import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { consumeLimit, otpVerifyLimiter } from '@/lib/rateLimit';
import { verifyCode } from '@/lib/otp';
import { signSession } from '@/lib/auth';
import { setSessionCookie } from '@/lib/session';
import { logAudit } from '@/lib/audit';

const Body = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: '입력이 올바르지 않습니다' }, { status: 400 });
  }
  const { email, code } = parsed.data;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = await consumeLimit(otpVerifyLimiter, `${ip}:${email}`);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요' },
      { status: 429 },
    );
  }

  const member = await prisma.member.findFirst({
    where: { email, active: true, deletedAt: null },
  });
  if (!member) {
    return NextResponse.json({ ok: false, error: '코드가 올바르지 않습니다' }, { status: 401 });
  }

  const latest = await prisma.loginCode.findFirst({
    where: { memberId: member.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (
    !latest ||
    latest.usedAt ||
    latest.expiresAt < new Date() ||
    latest.attempts >= 5
  ) {
    await logAudit({
      actorId: member.id,
      action: 'LOGIN_FAIL',
      metadata: { reason: 'no-valid-code', ip },
    });
    return NextResponse.json({ ok: false, error: '코드가 만료되었거나 시도 횟수를 초과했습니다' }, { status: 401 });
  }

  const ok = await verifyCode(latest.codeHash, code);
  if (!ok) {
    await prisma.loginCode.update({
      where: { id: latest.id },
      data: { attempts: { increment: 1 } },
    });
    await logAudit({ actorId: member.id, action: 'LOGIN_FAIL', metadata: { reason: 'wrong-code', ip } });
    return NextResponse.json({ ok: false, error: '코드가 올바르지 않습니다' }, { status: 401 });
  }

  await prisma.loginCode.update({
    where: { id: latest.id },
    data: { usedAt: new Date() },
  });
  const token = await signSession({ memberId: member.id, role: member.role });
  await setSessionCookie(token);
  await logAudit({ actorId: member.id, action: 'LOGIN_SUCCESS', metadata: { ip } });

  return NextResponse.json({ ok: true });
}
