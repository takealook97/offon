import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { listHolidays } from '@/lib/holidays';

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const holidays = await listHolidays({ from, to });
    return NextResponse.json({ ok: true, holidays });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
