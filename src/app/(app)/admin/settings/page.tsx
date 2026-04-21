import { requireAdmin } from '@/lib/session';
import { getAppSettings } from '@/lib/settings';
import { SettingsPanel } from './SettingsPanel';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getAppSettings();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">설정</h1>
        <p className="text-sm text-muted-foreground">
          관리자 전용 · 앱 전역 설정을 관리합니다
        </p>
      </header>
      <SettingsPanel initial={settings} />
    </div>
  );
}
