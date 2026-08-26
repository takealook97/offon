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

/**
 * Reads back the live member behind a verified token, or null if they can no longer sign in.
 *
 * The token is stateless and lasts 30 days, so everything it carries is a snapshot of the
 * moment it was issued. The role is therefore taken from the database rather than the token:
 * demoting an admin has to take effect now, not whenever their cookie happens to expire.
 * Deactivation is refused the same way, and both come out of the one query the guard was
 * already making — the select simply grew a column.
 */
export async function resolveSessionMember(
  token: SessionPayload,
): Promise<SessionPayload | null> {
  const member = await prisma.member.findFirst({
    where: { id: token.memberId, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!member) return null;
  return { memberId: member.id, role: member.role };
}

/**
 * The signed-in member as the database currently has them, or null.
 *
 * This is what a page wants when it decides what to render: `getSession` returns what the
 * cookie claims, which is up to 30 days stale, so choosing an admin-only tab from it shows a
 * demoted admin controls that every route behind them will refuse.
 */
export async function getLiveSession(): Promise<SessionPayload | null> {
  const s = await getSession();
  return s ? resolveSessionMember(s) : null;
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Response('unauthorized', { status: 401 });
  const live = await resolveSessionMember(s);
  if (!live) throw new Response('unauthorized', { status: 401 });
  return live;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const s = await requireSession();
  if (s.role !== 'ADMIN') throw new Response('forbidden', { status: 403 });
  return s;
}

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export async function setSessionCookie(token: string) {
  // Both Max-Age and an absolute Expires are set. Some Android Chrome and WebView stacks keep
  // a cookie with Expires more reliably than one with only Max-Age, which loses fewer sessions
  // when a home-screen PWA is reopened.
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
    expires: new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000),
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}
