import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { consumeLimit, otpRequestLimiter } from '@/lib/rateLimit';
import { generateCode, hashCode } from '@/lib/otp';
import { sendDm } from '@/lib/slack';
import { logAudit } from '@/lib/audit';

const Body = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: '이메일 형식이 올바르지 않습니다' }, { status: 400 });
  }
  const { email } = parsed.data;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = await consumeLimit(otpRequestLimiter, `${ip}:${email}`);
  if (!limit.ok) {
    const retrySec = Math.ceil(limit.retryAfterMs / 1000);
    return NextResponse.json(
      { ok: false, error: `${retrySec}초 후 다시 시도해 주세요` },
      { status: 429 },
    );
  }

  const member = await prisma.member.findFirst({
    where: { email, deletedAt: null },
  });

  if (!member) {
    await logAudit({ action: 'LOGIN_UNKNOWN_EMAIL', metadata: { email, ip } });
    return NextResponse.json(
      { ok: false, error: '등록되지 않은 이메일입니다' },
      { status: 404 },
    );
  }

  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await prisma.loginCode.upsert({
    where: { memberId: member.id },
    create: { memberId: member.id, codeHash, expiresAt },
    update: { codeHash, expiresAt, usedAt: null, attempts: 0 },
  });

  const slackTokenReady =
    !!process.env.SLACK_BOT_TOKEN && !process.env.SLACK_BOT_TOKEN.includes('replace-me');
  const devBypass = process.env.NODE_ENV !== 'production' && !slackTokenReady;

  if (devBypass) {
    // dev only: Slack 토큰 미설정 시 OTP는 수동 입력으로 검증한다.
  } else {
    try {
      await sendDm(member.slackId, `offon 로그인 코드: ${code} (5분 유효)`);
    } catch (err) {
      await logAudit({
        actorId: member.id,
        action: 'SLACK_SEND_FAIL',
        metadata: { stage: 'login_otp', error: String(err) },
      });
      return NextResponse.json(
        { ok: false, error: 'Slack DM 전송 실패. 관리자에게 문의해 주세요' },
        { status: 500 },
      );
    }
  }

  await logAudit({ actorId: member.id, action: 'LOGIN_REQUEST', metadata: { ip } });
  return NextResponse.json({ ok: true });
}
