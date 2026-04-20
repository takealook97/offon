---
name: next16-patterns
description: The Next.js 16 App Router conventions to check before writing anything - route handlers, server actions, proxy.ts (not middleware), the asynchronous cookies() and headers(), and the folder layout. Much of this differs from earlier versions, so read it rather than guessing.
---

# Next.js 16 conventions

## Route Handler (`src/app/api/**/route.ts`)
- The file must be named `route.ts`. It cannot sit in the same segment as a `page.tsx`.
- Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, each an exported async function.
- The signature:
  ```ts
  import { NextRequest, NextResponse } from 'next/server';

  export async function POST(req: NextRequest) {
    const body = await req.json();
    return NextResponse.json({ ok: true });
  }
  ```
- Dynamic segments arrive in a second argument. **From Next 15 onwards `params` is itself a promise**, so it has to be awaited.

## Server Action
- `'use server'` at the top of the file, or on the function.
- Imported into a client component and used as a form action, or called from a handler.
- The return value has to be serialisable; convert dates to ISO strings.
- **Every server action needs its own authentication check.** They can be POSTed to directly.

## Proxy (Next 16, `src/proxy.ts`)
- **Not `middleware.ts`.** Next 16 renamed it.
- Exactly one, at the project root or in `src/`.
- The signature:
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
- It runs on Fluid Compute, so the whole Node.js runtime is available.

## cookies() and headers() are **both async**
```ts
import { cookies, headers } from 'next/headers';

// The same in a server component, a route handler and a server action
const cookieStore = await cookies();
const token = cookieStore.get('session')?.value;

// Writing is only possible in a route handler or a server action
cookieStore.set('session', jwt, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
});

cookieStore.delete('session');
```
- These were synchronous up to 14.x and **asynchronous from 15 onwards**. A missing `await` is a type error.

## App Router layout
- `src/app/(group)/**` is a route group; it does not appear in the URL. This project uses `(app)` to hold the authenticated pages.
- `src/app/layout.tsx` is the root layout.
- `src/app/page.tsx` is the root page.
- `loading.tsx`, `error.tsx` and `not-found.tsx` belong to their own segment.

## Fetching data in a page
- Call the query directly in a server component.
- Passed down as props. Only the parts that need interaction go inside a 'use client' boundary.

## redirect / notFound
```ts
import { redirect, notFound } from 'next/navigation';
if (!session) redirect('/login');
if (!member) notFound();
```

## When to update this file
- Right after a Next.js minor upgrade; check the release notes.
- Whenever a convention here turns out to conflict with reality.
