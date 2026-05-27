import { getSession } from '@/lib/session';
import { CalendarTabs } from './CalendarTabs';

export default async function CalendarPage() {
  const session = await getSession();
  const isAdmin = session?.role === 'ADMIN';
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">Your attendance and leave, or the team's</p>
      </header>
      <CalendarTabs isAdmin={isAdmin} />
    </div>
  );
}
