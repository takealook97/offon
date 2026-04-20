import { RateLimiterMemory } from 'rate-limiter-flexible';

export const otpRequestLimiter = new RateLimiterMemory({ points: 1, duration: 30 });
export const otpVerifyLimiter = new RateLimiterMemory({ points: 10, duration: 60 });

export async function consumeLimit(
  limiter: RateLimiterMemory,
  key: string,
): Promise<{ ok: boolean; retryAfterMs: number }> {
  try {
    await limiter.consume(key);
    return { ok: true, retryAfterMs: 0 };
  } catch (res) {
    const retryAfterMs = (res as { msBeforeNext?: number }).msBeforeNext ?? 30_000;
    return { ok: false, retryAfterMs };
  }
}
