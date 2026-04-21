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
        <h1 className="text-2xl font-semibold tracking-tight">설정</h1>
        <p className="text-sm text-muted-foreground">
          관리자 전용 · 앱 전역 설정을 관리합니다
        </p>
      </header>
      <SettingsPanel initial={settings} />
      <HolidaysPanel initial={holidays} />
    </div>
  );
}
