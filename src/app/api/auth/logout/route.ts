import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
import { getSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export async function POST() {
  const session = await getSession();
  await clearSessionCookie();
  if (session) await logAudit({ actorId: session.sub, action: 'LOGOUT' });
  return NextResponse.json({ ok: true });
}
