---
name: next16-patterns
description: Next.js 16 App Router 작업 시 반드시 참조할 규약 모음. Route Handler, Server Action, proxy.ts(middleware 아님), 비동기 cookies()/headers(), App Router 폴더 컨벤션. "API 추가", "인증 가드 수정", "페이지 추가", "proxy 설정 바꿔줘" 같은 요청에 트리거. 이전 버전 Next.js와 다른 규약이 많으므로 추측하지 말고 이 문서를 읽어라.
---

# Next.js 16 규약

## Route Handler (`src/app/api/**/route.ts`)
- 파일명은 반드시 `route.ts`. 같은 세그먼트에 `page.tsx`와 공존 불가.
- 지원 메서드: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`. 각각 export한 async 함수.
- 시그니처:
  ```ts
  import { NextRequest, NextResponse } from 'next/server';

  export async function POST(req: NextRequest) {
    const body = await req.json();
    return NextResponse.json({ ok: true });
  }
  ```
- 동적 세그먼트: 2번째 인자 `context: { params: Promise<{ id: string }> }`. **Next 15+는 params도 Promise**. `const { id } = await context.params;`.

## Server Action
- 파일 최상단 `'use server'` 또는 함수 레벨 `'use server'`.
- 클라이언트 컴포넌트에서 import해 `form action={serverAction}` 또는 `onClick`에서 호출.
- 반환값은 직렬화 가능 객체 (Date는 ISO string으로 변환 권장).
- **모든 Server Action에 인증 체크 필수** — 외부에서 직접 POST가 가능하므로.

## Proxy (Next 16, `src/proxy.ts`)
- **`middleware.ts` 아님**. Next 16에서 rename.
- 프로젝트 루트 또는 `src/`에 단 1개만.
- 시그니처:
  ```ts
  import { NextRequest, NextResponse } from 'next/server';
  import { cookies } from 'next/headers';

  export async function proxy(req: NextRequest) {
    const token = (await cookies()).get('session')?.value;
    // ...
    return NextResponse.next();
  }

  export const config = {
    matcher: ['/((?!api/auth|login|_next|favicon.ico|public).*)'],
  };
  ```
- Fluid Compute 기반, 전체 Node.js 런타임 사용 가능.

## cookies() / headers() — **모두 async**
```ts
import { cookies, headers } from 'next/headers';

// Server Component / Route Handler / Server Action 전부 동일
const cookieStore = await cookies();
const token = cookieStore.get('session')?.value;

// 설정 (Route Handler / Server Action에서만)
cookieStore.set('session', jwt, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
});

cookieStore.delete('session');
```
- 14.x 이하에서 동기였던 것이 **15+에서 비동기**. `await` 누락 시 타입 에러.

## App Router 레이아웃
- `src/app/(group)/**` — 라우트 그룹. URL에는 노출 안 됨. 본 프로젝트에서는 `(app)` 그룹으로 인증 페이지 묶음.
- `src/app/layout.tsx` — 루트 레이아웃.
- `src/app/page.tsx` — 루트 페이지.
- `loading.tsx`, `error.tsx`, `not-found.tsx` — 각 세그먼트 전용.

## 페이지에서 데이터 fetch
- Server Component에서 `await prisma.xxx.findMany(...)` 직접 호출.
- 클라이언트 컴포넌트에 props로 전달. 필요한 상호작용만 `'use client'` 경계 안으로.

## redirect / notFound
```ts
import { redirect, notFound } from 'next/navigation';
if (!session) redirect('/login');
if (!member) notFound();
```

## 이 문서를 업데이트해야 할 때
- Next.js 마이너 업그레이드 직후 (특히 16.3+ 릴리즈 노트 확인)
- 새로운 규약 충돌이 발견됐을 때
