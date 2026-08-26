import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextRequest } from 'next/server';
import { checkCronAuth } from './cron-auth';

const SECRET = 'test-cron-secret';

/** checkCronAuth uses nothing but headers.get, so this is the smallest request offering that. */
function requestWith(authorization: string | null): NextRequest {
  return {
    headers: { get: (name: string) => (name === 'authorization' ? authorization : null) },
  } as unknown as NextRequest;
}

function withSecret<T>(secret: string | undefined, run: () => T): T {
  const previous = process.env.CRON_SECRET;
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
}

test('accepts the matching bearer token', () => {
  withSecret(SECRET, () => {
    assert.deepEqual(checkCronAuth(requestWith(`Bearer ${SECRET}`)), { ok: true });
  });
});

test('reports misconfigured when CRON_SECRET is unset', () => {
  withSecret(undefined, () => {
    // With no secret configured, no header may get through. It fails closed.
    assert.deepEqual(checkCronAuth(requestWith('Bearer anything')), {
      ok: false,
      reason: 'misconfigured',
    });
  });
});

test('rejects a missing authorization header', () => {
  withSecret(SECRET, () => {
    assert.deepEqual(checkCronAuth(requestWith(null)), { ok: false, reason: 'unauthorized' });
  });
});

test('rejects a wrong token of the same length without throwing', () => {
  withSecret(SECRET, () => {
    const wrong = 'x'.repeat(SECRET.length);
    assert.deepEqual(checkCronAuth(requestWith(`Bearer ${wrong}`)), {
      ok: false,
      reason: 'unauthorized',
    });
  });
});

test('rejects a token of a different length without throwing', () => {
  withSecret(SECRET, () => {
    // timingSafeEqual throws on differing lengths, so the length guard has to come first.
    assert.deepEqual(checkCronAuth(requestWith('Bearer short')), {
      ok: false,
      reason: 'unauthorized',
    });
  });
});

test('rejects the bare secret without the Bearer prefix', () => {
  withSecret(SECRET, () => {
    assert.deepEqual(checkCronAuth(requestWith(SECRET)), { ok: false, reason: 'unauthorized' });
  });
});

test('rejects a differently-cased scheme', () => {
  withSecret(SECRET, () => {
    assert.deepEqual(checkCronAuth(requestWith(`bearer ${SECRET}`)), {
      ok: false,
      reason: 'unauthorized',
    });
  });
});

test('rejects an empty authorization header', () => {
  withSecret(SECRET, () => {
    assert.deepEqual(checkCronAuth(requestWith('')), { ok: false, reason: 'unauthorized' });
  });
});
