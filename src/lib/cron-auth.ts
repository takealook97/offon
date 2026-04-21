import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Vercel Cron 호출 인증.
 * - CRON_SECRET 미설정: misconfigured (호출자 관점 500에 매핑)
 * - header 누락/불일치: unauthorized (401 매핑)
 * 길이 다른 버퍼에 timingSafeEqual을 쓰면 throw하므로 길이 선비교 후 동일 길이일 때만 비교.
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
