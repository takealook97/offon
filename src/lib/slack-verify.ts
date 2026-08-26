import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verification of Slack's request signing.
 *
 * - No SLACK_SIGNING_SECRET gives `misconfigured`, which the router maps to a 500.
 * - A missing, non-numeric or more-than-five-minutes-old timestamp gives `unauthorized`,
 *   which is what stops a replay.
 * - The hex of HMAC-SHA256 over `v0:{ts}:{rawBody}`, prefixed with `v0=`, is compared against
 *   x-slack-signature.
 * - Lengths are compared first, and timingSafeEqual runs only on equal lengths.
 *
 * rawBody must be the request body verbatim. Never re-serialise it through URLSearchParams.
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
