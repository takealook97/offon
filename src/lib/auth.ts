import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
const alg = 'HS256';

export type SessionPayload = { memberId: number; role: 'EMPLOYEE' | 'ADMIN' };

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ memberId: payload.memberId, role: payload.role })
    .setProtectedHeader({ alg })
    .setSubject(String(payload.memberId))
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret, { algorithms: [alg] });
  const memberId = Number(payload.memberId ?? payload.sub);
  const role = payload.role;
  if (!Number.isInteger(memberId) || memberId <= 0) throw new Error('invalid memberId');
  if (role !== 'EMPLOYEE' && role !== 'ADMIN') throw new Error('invalid role');
  return { memberId, role };
}
