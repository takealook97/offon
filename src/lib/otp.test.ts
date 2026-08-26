import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, hashCode, verifyCode } from './otp';

process.env.OTP_PEPPER ??= 'test-pepper';

test('generates a six-digit code', () => {
  for (let i = 0; i < 200; i += 1) {
    assert.match(generateCode(), /^\d{6}$/);
  }
});

test('keeps leading zeros instead of producing a short code', () => {
  // crypto.randomInt(0, 1_000_000) will produce small numbers such as 7. Without padStart the
  // code goes out as '7' and cannot fill a six-digit field.
  const codes = Array.from({ length: 5000 }, generateCode);
  assert.ok(
    codes.every((code) => code.length === 6),
    'every generated code must be exactly six characters',
  );
});

test('produces more than one distinct code', () => {
  const codes = new Set(Array.from({ length: 100 }, generateCode));
  assert.ok(codes.size > 1, 'generateCode must not be constant');
});

test('verifies a code against its own hash', async () => {
  const code = '012345';
  assert.equal(await verifyCode(await hashCode(code), code), true);
});

test('rejects a wrong code', async () => {
  const hash = await hashCode('012345');
  assert.equal(await verifyCode(hash, '543210'), false);
});

test('rejects a code that differs only by a stripped leading zero', async () => {
  const hash = await hashCode('012345');
  assert.equal(await verifyCode(hash, '12345'), false);
});

test('hashes the same code differently each time', async () => {
  // argon2 salts every hash, so even the same code must never store the same value twice.
  const [a, b] = await Promise.all([hashCode('000000'), hashCode('000000')]);
  assert.notEqual(a, b);
  assert.equal(await verifyCode(a, '000000'), true);
  assert.equal(await verifyCode(b, '000000'), true);
});

test('does not store the code in the hash', async () => {
  const hash = await hashCode('424242');
  assert.ok(!hash.includes('424242'), 'the plaintext code must not appear in the stored hash');
});

test('returns false rather than throwing on a malformed hash', async () => {
  // A corrupted value in the database must not take the sign-in route down with a 500.
  assert.equal(await verifyCode('not-an-argon2-hash', '012345'), false);
  assert.equal(await verifyCode('', '012345'), false);
});

test('a code hashed under a different pepper does not verify', async () => {
  const original = process.env.OTP_PEPPER;
  process.env.OTP_PEPPER = 'pepper-one';
  const hash = await hashCode('012345');
  process.env.OTP_PEPPER = 'pepper-two';
  try {
    // A changed pepper makes a leaked hash useless on its own, which is the whole point of having one.
    assert.equal(await verifyCode(hash, '012345'), false);
  } finally {
    process.env.OTP_PEPPER = original;
  }
});
