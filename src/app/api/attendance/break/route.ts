import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { startBreak } from '@/lib/attendance';

export async function POST() {
  try {
    const session = await requireSession();
    // Meals have their own endpoint, so nothing here guesses at one from the time of day.
    const result = await startBreak(session.memberId, 'web');
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: (await getT())(result.messageKey) },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, attendance: result.attendance });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
