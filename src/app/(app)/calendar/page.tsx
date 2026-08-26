import { getSession } from '@/lib/session';
import { CalendarTabs } from './CalendarTabs';
import { getT } from '@/lib/i18n/server';

export default async function CalendarPage() {
  const t = await getT();
  const session = await getSession();
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
