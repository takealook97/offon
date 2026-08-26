import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/session';
import { getAppSettings, updateAppSettings } from '@/lib/settings';
import { logAudit } from '@/lib/audit';
import { getT } from '@/lib/i18n/server';

const PatchBody = z.object({
  missingClockInNotifyEnabled: z.boolean().optional(),
  missingClockOutNotifyEnabled: z.boolean().optional(),
});

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
