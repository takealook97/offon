import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';

/**
 * The session token is the whole of the authorisation story: there is no server-side session
 * table, so a token this module accepts is a person the application believes in. What matters
 * here is therefore not that a good token round-trips — it is that every bad one is refused.
 *
 * SESSION_SECRET is read once when the module is first loaded, so it is set before the import.
 */
const SECRET = 'test-secret-not-a-real-one';
process.env.SESSION_SECRET = SECRET;

type Auth = typeof import('./auth');
let auth: Auth;
before(async () => {
  auth = await import('./auth');
});

const key = () => new TextEncoder().encode(SECRET);

/** Signs a payload directly, so a token the real signer would never produce can be built. */
function forge(payload: Record<string, unknown>, secret = SECRET) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(secret));
}

test('a signed session verifies back to the same payload', async () => {
  // Arrange
  const payload = { memberId: 42, role: 'ADMIN' } as const;

  // Act
  const token = await auth.signSession(payload);
  const verified = await auth.verifySession(token);

  // Assert
  assert.deepEqual(verified, { memberId: 42, role: 'ADMIN' });
});

test('a token signed with another secret is refused', async () => {
  // Arrange: what an attacker who guessed the shape but not the secret would produce.
  const token = await forge({ memberId: 1, role: 'ADMIN' }, 'a-different-secret');

  // Act + Assert
  await assert.rejects(() => auth.verifySession(token));
});

test('a tampered payload is refused', async () => {
  // Arrange: flip the role in the payload segment and leave the signature alone.
  const token = await auth.signSession({ memberId: 7, role: 'EMPLOYEE' });
  const [header, body, signature] = token.split('.');
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
  const tampered = Buffer.from(JSON.stringify({ ...decoded, role: 'ADMIN' }))
    .toString('base64url');

  // Act + Assert
  await assert.rejects(() => auth.verifySession(`${header}.${tampered}.${signature}`));
});

test('an unsecured "alg: none" token is refused', async () => {
  // Arrange: the classic algorithm-confusion forgery — a valid JWT shape with no signature.
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ memberId: 1, role: 'ADMIN' })).toString('base64url');

  // Act + Assert
  await assert.rejects(() => auth.verifySession(`${header}.${body}.`));
});

test('an expired token is refused', async () => {
  // Arrange
  const token = await new SignJWT({ memberId: 1, role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 60 * 60)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(key());

  // Act + Assert
  await assert.rejects(() => auth.verifySession(token));
});

test('a role outside the two known values is refused', async () => {
  // Arrange: correctly signed, but naming a role the application does not have.
  const token = await forge({ memberId: 1, role: 'SUPERADMIN' });

  // Act + Assert
  await assert.rejects(() => auth.verifySession(token), /invalid role/);
});

test('a missing role is refused rather than defaulting to employee', async () => {
  // Arrange
  const token = await forge({ memberId: 1 });

  // Act + Assert
  await assert.rejects(() => auth.verifySession(token), /invalid role/);
});

test('a non-numeric member id is refused', async () => {
  // Arrange
  const token = await forge({ memberId: 'not-a-number', role: 'ADMIN' });

  // Act + Assert
  await assert.rejects(() => auth.verifySession(token), /invalid memberId/);
});

test('a zero or negative member id is refused', async () => {
  // Arrange + Act + Assert
  for (const memberId of [0, -1]) {
    const token = await forge({ memberId, role: 'ADMIN' });
    await assert.rejects(
      () => auth.verifySession(token),
      /invalid memberId/,
      `memberId ${memberId} must not verify`,
    );
  }
});

test('a fractional member id is refused rather than truncated', async () => {
  // Arrange
  const token = await forge({ memberId: 1.5, role: 'ADMIN' });

  // Act + Assert
  await assert.rejects(() => auth.verifySession(token), /invalid memberId/);
});

test('rubbish that is not a token at all is refused', async () => {
  // Act + Assert
  for (const bad of ['', 'not.a.token', 'a.b', '....']) {
    await assert.rejects(() => auth.verifySession(bad), `"${bad}" must not verify`);
  }
});
