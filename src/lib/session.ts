import { cookies } from 'next/headers';
import { verifySession, type SessionPayload } from './auth';
import { prisma } from './prisma';

const COOKIE = 'session';

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Response('unauthorized', { status: 401 });
  // A deactivated member is refused even while their token is still valid, so deactivation takes effect at once.
  const member = await prisma.member.findFirst({
    where: { id: s.memberId, deletedAt: null },
    select: { id: true },
  });
  if (!member) throw new Response('unauthorized', { status: 401 });
  return s;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const s = await requireSession();
  if (s.role !== 'ADMIN') throw new Response('forbidden', { status: 403 });
  return s;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}
