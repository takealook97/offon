import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { consumeLimit } from './rateLimit';

/**
 * The wrapper around the limiter. What matters is that exhausting it is reported rather than
 * thrown: rate-limiter-flexible signals a refusal by rejecting, and an unhandled rejection on
 * the login endpoint would be a 500 where a 429 belongs.
 */

test('a request within the allowance is let through', async () => {
  // Arrange
  const limiter = new RateLimiterMemory({ points: 2, duration: 60 });

  // Act
  const first = await consumeLimit(limiter, 'someone');

  // Assert
  assert.deepEqual(first, { ok: true, retryAfterMs: 0 });
});

test('exhausting the allowance is reported, not thrown', async () => {
  // Arrange
  const limiter = new RateLimiterMemory({ points: 1, duration: 60 });
  await consumeLimit(limiter, 'someone');

  // Act
  const second = await consumeLimit(limiter, 'someone');

  // Assert
  assert.equal(second.ok, false);
  assert.ok(second.retryAfterMs > 0, 'the caller needs something to put in Retry-After');
});

test('the allowance is counted per key, so one caller cannot lock out another', async () => {
  // Arrange
  const limiter = new RateLimiterMemory({ points: 1, duration: 60 });
  await consumeLimit(limiter, 'noisy');

  // Act
  const other = await consumeLimit(limiter, 'quiet');

  // Assert
  assert.equal(other.ok, true);
});

test('every point in the allowance is usable before it refuses', async () => {
  // Arrange
  const limiter = new RateLimiterMemory({ points: 3, duration: 60 });

  // Act
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await consumeLimit(limiter, 'someone'));

  // Assert
  assert.deepEqual(results.map((r) => r.ok), [true, true, true, false]);
});
