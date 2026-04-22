import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Slack request signing 검증.
 *
 * - SLACK_SIGNING_SECRET 미설정 → `misconfigured` (라우터는 500 매핑)
 * - timestamp 누락/숫자아님/5분 초과 → `unauthorized` (replay 방지)
 * - HMAC-SHA256(`v0:{ts}:{rawBody}`) 의 hex 를 `v0=` prefix 붙여 x-slack-signature 와 비교.
 * - 길이 선비교 후 동일 길이에서만 timingSafeEqual.
 *
 * rawBody 는 반드시 요청 원문 문자열. URLSearchParams 후 재직렬화 금지.
 */
export type VerifyResult = { ok: true } | { ok: false; reason: string };

const FIVE_MINUTES_SEC = 60 * 5;

export function verifySlackSignature(opts: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
}): VerifyResult {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return { ok: false, reason: 'misconfigured' };

  const { rawBody, timestamp, signature } = opts;
  if (!timestamp || !signature) return { ok: false, reason: 'unauthorized' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'unauthorized' };

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > FIVE_MINUTES_SEC) {
    return { ok: false, reason: 'unauthorized' };
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: 'unauthorized' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'unauthorized' };
}
