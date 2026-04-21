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
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Admin only · manage the application-wide settings
        </p>
      </header>
      <SettingsPanel initial={settings} />
    </div>
  );
}
