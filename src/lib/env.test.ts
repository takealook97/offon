import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSecret } from './env';

/**
 * The three secrets were read with a non-null assertion, which is a promise to the type
 * checker and nothing at all at runtime. Two ways that went wrong:
 *
 * SESSION_SECRET unset became a zero-length key, which jose refuses — so signing in failed,
 * but as an opaque 500 at the moment someone tried, with nothing naming the cause.
 *
 * OTP_PEPPER unset was worse, because it worked. String concatenation turned it into the
 * literal "undefined", so every login code in the database was hashed with a pepper an
 * attacker can guess. The whole point of a pepper is that a database dump is not enough to
 * brute-force a six-digit code offline, and that protection was silently absent.
 *
 * checkCronAuth already had the right shape — no secret means misconfigured, fail closed.
 * This is that, for the rest of them.
 */

test('a set secret is returned unchanged', () => {
  // Arrange
  const env = { MY_SECRET: 'a-real-value' };

  // Act
  const value = requireSecret('MY_SECRET', env);

  // Assert
  assert.equal(value, 'a-real-value');
});

test('a missing secret throws, and the message names the variable', () => {
  // Act + Assert
  assert.throws(() => requireSecret('MY_SECRET', {}), /MY_SECRET/);
});

test('an empty secret is treated as missing', () => {
  // Act + Assert
  assert.throws(() => requireSecret('MY_SECRET', { MY_SECRET: '' }), /MY_SECRET/);
});

test('a whitespace-only secret is treated as missing', () => {
  // Arrange: what a stray quote in a .env file leaves behind.
  // Act + Assert
  assert.throws(() => requireSecret('MY_SECRET', { MY_SECRET: '   ' }), /MY_SECRET/);
});

test('the literal string "undefined" is refused', () => {
  // Arrange: what shell interpolation of an unset variable writes into a .env file, and what
  // string concatenation with an unset variable produced before this existed.
  // Act + Assert
  assert.throws(() => requireSecret('MY_SECRET', { MY_SECRET: 'undefined' }), /MY_SECRET/);
});

test('the message says how to generate one', () => {
  // Act + Assert
  assert.throws(() => requireSecret('MY_SECRET', {}), /openssl rand -base64 32/);
});

test('a value that merely looks odd is still accepted', () => {
  // Arrange: judging secret quality is not this function's job, and guessing wrong would
  // lock out a working deployment on upgrade.
  // Act + Assert
  assert.equal(requireSecret('MY_SECRET', { MY_SECRET: 'x' }), 'x');
});
