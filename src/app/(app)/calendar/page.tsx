import { getLiveSession } from '@/lib/session';
import { CalendarTabs } from './CalendarTabs';
import { getT } from '@/lib/i18n/server';

export default async function CalendarPage() {
  const t = await getT();
  // The stored role, not the one in the cookie: the team tab is admin-only, and a demoted
  // admin should stop seeing it now rather than when their session happens to expire.
  const session = await getLiveSession();
  const isAdmin = session?.role === 'ADMIN';
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('cal.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('cal.subtitle')}</p>
      </header>
      <CalendarTabs isAdmin={isAdmin} />
    </div>
  );
}
