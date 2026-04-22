import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth';

export const config = {
  matcher: [
    '/((?!api/auth|api/cron|api/slack|login|_next/static|_next/image|.*\\..*).*)',
  ],
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
