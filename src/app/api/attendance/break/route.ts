import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { startBreak, type BreakKind } from '@/lib/attendance';
import { formatKST } from '@/lib/time';

// A break starting around midday is classified as lunch, so that
// the Slack announcement takes the same form as the meal command produces.
function pickKindForNow(): BreakKind {
  const kstHour = Number(formatKST(new Date(), 'H'));
  return kstHour >= 11 && kstHour < 14 ? 'lunch' : 'break';
}

export async function POST() {
  try {
    const session = await requireSession();
    const result = await startBreak(session.memberId, 'web', pickKindForNow());
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
