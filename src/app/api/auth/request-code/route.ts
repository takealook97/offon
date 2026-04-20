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
    return NextResponse.json({ ok: false, error: 'That email address is not valid' }, { status: 400 });
  }
  const { email } = parsed.data;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = await consumeLimit(otpRequestLimiter, `${ip}:${email}`);
  if (!limit.ok) {
    const retrySec = Math.ceil(limit.retryAfterMs / 1000);
    return NextResponse.json(
      { ok: false, error: `Please try again in ${retrySec} seconds` },
      { status: 429 },
    );
  }

  const member = await prisma.member.findFirst({
    where: { email, deletedAt: null },
  });

  if (!member) {
    await logAudit({ action: 'LOGIN_UNKNOWN_EMAIL', metadata: { email, ip } });
    return NextResponse.json(
      { ok: false, error: 'No account is registered with that email' },
      { status: 404 },
    );
  }

  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await prisma.loginCode.create({
    data: { memberId: member.id, codeHash, expiresAt },
  });

  const slackTokenReady =
    !!process.env.SLACK_BOT_TOKEN && !process.env.SLACK_BOT_TOKEN.includes('replace-me');
  const devBypass = process.env.NODE_ENV !== 'production' && !slackTokenReady;

  if (devBypass) {
    // Development only: with no Slack token the code is verified by hand.
  } else {
    try {
      await sendDm(member.slackId, `Your offon sign-in code: ${code} (valid for 5 minutes)`);
    } catch (err) {
      await logAudit({
        actorId: member.id,
        action: 'SLACK_SEND_FAIL',
        metadata: { stage: 'login_otp', error: String(err) },
      });
      return NextResponse.json(
        { ok: false, error: 'The Slack DM could not be sent. Please contact an admin' },
        { status: 500 },
      );
    }
  }

  await logAudit({ actorId: member.id, action: 'LOGIN_REQUEST', metadata: { ip } });
  return NextResponse.json({ ok: true });
}
