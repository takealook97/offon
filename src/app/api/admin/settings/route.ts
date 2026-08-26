import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/session';
import { getAppSettings, updateAppSettings } from '@/lib/settings';
import { logAudit } from '@/lib/audit';
import { getT } from '@/lib/i18n/server';

const minuteOfDay = z.number().int().min(0).max(24 * 60);

const PatchBody = z
  .object({
    missingClockInNotifyEnabled: z.boolean().optional(),
    missingClockOutNotifyEnabled: z.boolean().optional(),
    roomOpenMinutes: minuteOfDay.optional(),
    roomCloseMinutes: minuteOfDay.optional(),
    /** Under five minutes is a mis-click; over four hours is not a break but a split shift. */
    mealMinutes: z.number().int().min(5).max(240).optional(),
  })
  // Sending one side alone would have to be compared against the stored value, so a window is sent whole or not at all.
  .refine(
    (v) =>
      v.roomOpenMinutes === undefined ||
      v.roomCloseMinutes === undefined ||
      v.roomCloseMinutes > v.roomOpenMinutes,
    { message: 'closing time must come after opening time' },
  );

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getAppSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const t = await getT();
  try {
    const session = await requireAdmin();
    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: t('api.badInput') },
        { status: 400 },
      );
    }
    const settings = await updateAppSettings(parsed.data);
    await logAudit({
      actorId: session.memberId,
      action: 'APP_SETTINGS_UPDATE',
      metadata: parsed.data,
    });
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
