import { getT } from '@/lib/i18n/server';
import { requireAdmin } from '@/lib/session';
import { getAppSettings } from '@/lib/settings';
import { listHolidays } from '@/lib/holidays';
import { SettingsPanel } from './SettingsPanel';
import { PolicyPanel } from './PolicyPanel';
import { HolidaysPanel } from './HolidaysPanel';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const t = await getT();
  await requireAdmin();
  const [settings, holidays] = await Promise.all([
    getAppSettings(),
    listHolidays(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('settings.subtitle')}
        </p>
      </header>
      <SettingsPanel initial={settings} />
      <PolicyPanel initial={settings} />
      <HolidaysPanel initial={holidays} />
    </div>
  );
}
