---
name: jwt-cookie-auth
description: Issuing and verifying session tokens, the session cookie, the proxy guard and the role checks in offon. Use it for authentication bugs, changing how sessions work, restricting something to admins, or signing out. It uses jose; never jsonwebtoken.
---

# Sessions: a signed token in a cookie

## Why jose
- `jsonwebtoken` is Node-only and unreliable in the proxy runtime.
- `jose` is built on Web Crypto and works in both runtimes, which is what the Next.js authentication guide recommends.

## Dependencies
- `jose`

## Environment
- `SESSION_SECRET` — a random secret of at least 32 bytes.

## Signing and verifying (`src/lib/auth.ts`)
```ts
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
const alg = 'HS256';

export type SessionPayload = { sub: string; role: 'EMPLOYEE' | 'ADMIN' };

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret, { algorithms: [alg] });
  return { sub: String(payload.sub), role: payload.role as SessionPayload['role'] };
}
```

## Session helpers (`src/lib/session.ts`)
```ts
import { cookies } from 'next/headers';
import { verifySession, type SessionPayload } from './auth';

const COOKIE = 'session';

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try { return await verifySession(token); } catch { return null; }
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Response('unauthorized', { status: 401 });
  return s;
}

export async function requireRole(role: SessionPayload['role']): Promise<SessionPayload> {
  const s = await requireSession();
  if (s.role !== role && !(role === 'EMPLOYEE')) throw new Response('forbidden', { status: 403 });
  // An admin passes everywhere; an employee only where an employee is what is asked for
  return s;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}
```

## The global proxy (`src/proxy.ts`)
```ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth';

export const config = {
  matcher: ['/((?!api/auth|api/cron|login|_next/static|_next/image|favicon.ico).*)'],
};

export async function proxy(req: NextRequest) {
  const token = (await cookies()).get('session')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));
  try {
    await verifySession(token);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}
```

## Admin routes are guarded twice
The proxy only checks that someone is signed in. An admin page checks the role itself, at the top of its server component:
```ts
import { requireRole } from '@/lib/session';
export default async function AdminPage() {
  await requireRole('ADMIN');
  // ...
}
```
The API handlers do the same.

## Signing out
```ts
// POST /api/auth/logout
await clearSessionCookie();
return NextResponse.json({ ok: true });
```

## Never
- Never store the token in `localStorage`.
- Never set `SameSite=None`; nothing here is cross-site.
- Nothing identifying goes in the payload: the member id and the role, and nothing else.
