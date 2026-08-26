import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { isDayString, listHolidays } from '@/lib/holidays';
import { getT } from '@/lib/i18n/server';

export async function GET(req: NextRequest) {
  const t = await getT();
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    // A bound that is present but unusable is a mistake worth reporting. Letting it through
    // drops the filter and returns the whole list, which reads as though it had applied.
    if ((from !== undefined && !isDayString(from)) || (to !== undefined && !isDayString(to))) {
      return NextResponse.json({ ok: false, error: t('api.badParams') }, { status: 400 });
    }
    const holidays = await listHolidays({ from, to });
    return NextResponse.json({ ok: true, holidays });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
