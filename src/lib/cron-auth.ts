import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Authenticates a call from Vercel Cron.
 * - No CRON_SECRET gives `misconfigured`, which the caller sees as a 500.
 * - A missing or wrong header gives `unauthorized`, a 401.
 * timingSafeEqual throws on buffers of different lengths, so lengths are compared first and
 * it runs only when they match.
 */
export type CronAuthResult =
  | { ok: true }
  | { ok: false; reason: 'misconfigured' | 'unauthorized' };

export function checkCronAuth(req: NextRequest): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: 'misconfigured' };
  const header = req.headers.get('authorization');
  if (!header) return { ok: false, reason: 'unauthorized' };
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: 'unauthorized' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'unauthorized' };
}
