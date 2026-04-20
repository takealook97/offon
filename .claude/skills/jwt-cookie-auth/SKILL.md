---
name: jwt-cookie-auth
description: offon의 JWT 발급·검증·세션 쿠키 설정·프록시 가드·역할 체크(ADMIN/EMPLOYEE) 작업에 반드시 사용. "인증 버그", "세션 바꿔줘", "관리자만 접근 가능하게", "로그아웃 처리" 요청에 트리거. jose 라이브러리 사용, jsonwebtoken은 쓰지 말 것.
---

# JWT + Cookie 세션

## 왜 jose인가
- `jsonwebtoken`은 Node 전용. Vercel proxy/Edge 런타임에서 불안정.
- `jose`는 Web Crypto 기반으로 Node + Edge 양쪽 호환. Next.js 공식 인증 가이드 추천.

## 의존성
- `jose`

## 환경변수
- `SESSION_SECRET` — 32바이트 이상 랜덤 secret.

## 서명/검증 (`src/lib/auth.ts`)
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

## 세션 유틸 (`src/lib/session.ts`)
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
  // ADMIN은 모든 경로 통과, EMPLOYEE는 EMPLOYEE-요구 경로만
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

## 전역 프록시 (`src/proxy.ts`)
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

## 관리자 경로 2차 방어
프록시에서는 인증 여부만 체크. 관리자 페이지는 서버 컴포넌트 최상단에서:
```ts
import { requireRole } from '@/lib/session';
export default async function AdminPage() {
  await requireRole('ADMIN');
  // ...
}
```
API 핸들러도 동일.

## 로그아웃
```ts
// POST /api/auth/logout
await clearSessionCookie();
return NextResponse.json({ ok: true });
```

## 금지 사항
- `localStorage`에 토큰 저장 금지.
- `SameSite=None` 금지(크로스사이트 불필요).
- JWT payload에 민감정보(이메일, Slack ID) 금지. `sub`(memberId)와 `role`만.
