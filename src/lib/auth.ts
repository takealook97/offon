import { SignJWT, jwtVerify } from 'jose';
import { requireSecret } from './env';

const alg = 'HS256';

/**
 * Read on first use rather than at import, so a build does not need the production secret.
 * Missing, it used to encode to a zero-length key: jose refuses that, so signing in failed
 * with nothing saying why. requireSecret says why.
 */
let cached: Uint8Array | undefined;
function secretKey(): Uint8Array {
  cached ??= new TextEncoder().encode(requireSecret('SESSION_SECRET'));
  return cached;
}

export type SessionPayload = { memberId: number; role: 'EMPLOYEE' | 'ADMIN' };

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ memberId: payload.memberId, role: payload.role })
    .setProtectedHeader({ alg })
    .setSubject(String(payload.memberId))
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secretKey(), { algorithms: [alg] });
  const memberId = Number(payload.memberId ?? payload.sub);
  const role = payload.role;
  if (!Number.isInteger(memberId) || memberId <= 0) throw new Error('invalid memberId');
  if (role !== 'EMPLOYEE' && role !== 'ADMIN') throw new Error('invalid role');
  return { memberId, role };
}
