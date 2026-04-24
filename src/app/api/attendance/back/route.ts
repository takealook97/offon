import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { endBreak } from '@/lib/attendance';

export async function POST() {
  try {
    const session = await requireSession();
    const result = await endBreak(session.memberId, 'web');
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, attendance: result.attendance });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
