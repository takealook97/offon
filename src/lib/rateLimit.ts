import { RateLimiterMemory } from 'rate-limiter-flexible';

/**
 * Throttles the login endpoints.
 *
 * These counters live in the memory of one process, which means what they are worth depends
 * on how offon was deployed:
 *
 * - **Docker or a single server** — one process, so the limits hold exactly as written.
 * - **Vercel or any serverless host** — several instances serve at once and each keeps its own
 *   counter, so a caller spreading requests across them gets a multiple of the limit.
 *
 * That is tolerable because these limiters are not the thing standing between an attacker and
 * an account. A login code is six digits, hashed with argon2 and a pepper, single-use, expires
 * in five minutes, and — the part that actually matters — `login_codes.attempts` is incremented
 * in the database on every wrong guess and the code is dead after five. That counter is shared
 * by every instance, so guessing is bounded no matter how the requests are spread.
 *
 * What these limiters do buy is a cap on how often a Slack DM can be triggered, and a cheap
 * way to shed obvious floods before they reach argon2. If a deployment needs a hard
 * organisation-wide limit, this is the seam to swap for a store the instances share.
 */

/** One code request per 30 seconds. Each one sends someone a DM, so this is mostly anti-nuisance. */
export const otpRequestLimiter = new RateLimiterMemory({ points: 1, duration: 30 });

/** Ten verification attempts a minute, ahead of the five-attempt limit held in the database. */
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
