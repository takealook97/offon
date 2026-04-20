import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
const alg = 'HS256';

export type SessionPayload = { sub: string; role: 'EMPLOYEE' | 'ADMIN' };

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret, { algorithms: [alg] });
  const role = payload.role;
  if (role !== 'EMPLOYEE' && role !== 'ADMIN') throw new Error('invalid role');
  return { sub: String(payload.sub), role };
}
