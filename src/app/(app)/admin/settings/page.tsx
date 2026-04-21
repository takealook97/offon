import { requireAdmin } from '@/lib/session';
import { getAppSettings } from '@/lib/settings';
import { listHolidays } from '@/lib/holidays';
import { SettingsPanel } from './SettingsPanel';
import { HolidaysPanel } from './HolidaysPanel';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [settings, holidays] = await Promise.all([
    getAppSettings(),
    listHolidays(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Admin only · manage the application-wide settings
        </p>
      </header>
      <SettingsPanel initial={settings} />
      <HolidaysPanel initial={holidays} />
    </div>
  );
}
