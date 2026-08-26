import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySlackSignature } from './slack-verify';

const SECRET = 'test-signing-secret';
const BODY = 'command=%2Fhi&user_id=U123&team_id=T123';

/** Builds a signature exactly the way Slack does. */
function sign(rawBody: string, timestamp: string, secret = SECRET) {
  return `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/** Wraps a test so it can set up its own secret. */
function withSecret<T>(secret: string | undefined, run: () => T): T {
  const previous = process.env.SLACK_SIGNING_SECRET;
  if (secret === undefined) delete process.env.SLACK_SIGNING_SECRET;
  else process.env.SLACK_SIGNING_SECRET = secret;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.SLACK_SIGNING_SECRET;
    else process.env.SLACK_SIGNING_SECRET = previous;
  }
}

test('accepts a correctly signed, fresh request', () => {
  const ts = String(nowSec());
  withSecret(SECRET, () => {
    const result = verifySlackSignature({ rawBody: BODY, timestamp: ts, signature: sign(BODY, ts) });
    assert.deepEqual(result, { ok: true });
  });
});

test('reports misconfigured when the signing secret is unset', () => {
  const ts = String(nowSec());
  withSecret(undefined, () => {
    const result = verifySlackSignature({ rawBody: BODY, timestamp: ts, signature: sign(BODY, ts) });
    assert.deepEqual(result, { ok: false, reason: 'misconfigured' });
  });
});

test('rejects a request whose body was tampered with after signing', () => {
  const ts = String(nowSec());
  withSecret(SECRET, () => {
    const signature = sign(BODY, ts);
    const tampered = BODY.replace('U123', 'U999');
    const result = verifySlackSignature({ rawBody: tampered, timestamp: ts, signature });
    assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
  });
});

test('rejects a signature made with a different secret', () => {
  const ts = String(nowSec());
  withSecret(SECRET, () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: ts,
      signature: sign(BODY, ts, 'someone-elses-secret'),
    });
    assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
  });
});

test('rejects a replayed request older than five minutes', () => {
  const stale = String(nowSec() - 60 * 5 - 1);
  withSecret(SECRET, () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: stale,
      signature: sign(BODY, stale),
    });
    assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
  });
});

test('rejects a timestamp too far in the future', () => {
  const ahead = String(nowSec() + 60 * 5 + 1);
  withSecret(SECRET, () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: ahead,
      signature: sign(BODY, ahead),
    });
    assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
  });
});

test('accepts a timestamp right at the five-minute edge', () => {
  const edge = String(nowSec() - 60 * 5);
  withSecret(SECRET, () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: edge,
      signature: sign(BODY, edge),
    });
    assert.deepEqual(result, { ok: true });
  });
});

test('rejects a missing timestamp or signature', () => {
  const ts = String(nowSec());
  withSecret(SECRET, () => {
    assert.deepEqual(
      verifySlackSignature({ rawBody: BODY, timestamp: null, signature: sign(BODY, ts) }),
      { ok: false, reason: 'unauthorized' },
    );
    assert.deepEqual(verifySlackSignature({ rawBody: BODY, timestamp: ts, signature: null }), {
      ok: false,
      reason: 'unauthorized',
    });
  });
});

test('rejects a non-numeric timestamp instead of treating it as epoch zero', () => {
  withSecret(SECRET, () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: 'not-a-number',
      signature: sign(BODY, 'not-a-number'),
    });
    assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
  });
});

test('rejects a signature of the wrong length without throwing', () => {
  const ts = String(nowSec());
  withSecret(SECRET, () => {
    // timingSafeEqual throws on differing lengths, so the length guard has to come first.
    const result = verifySlackSignature({ rawBody: BODY, timestamp: ts, signature: 'v0=short' });
    assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
  });
});

test('binds the signature to the timestamp, not just the body', () => {
  const ts = String(nowSec());
  const otherTs = String(nowSec() - 10);
  withSecret(SECRET, () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: ts,
      signature: sign(BODY, otherTs),
    });
    assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
  });
});
