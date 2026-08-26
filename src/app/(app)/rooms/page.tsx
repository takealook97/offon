import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { RoomCalendar } from './RoomCalendar';
import { getT } from '@/lib/i18n/server';
import { roomHours } from '@/lib/settings';

export default async function RoomsPage() {
  const t = await getT();
  // (app)/layout.tsx already guards the session, but the viewerId has to be resolved here to pass it down.
  const session = await getSession();
  if (!session) redirect('/login');
  const hours = await roomHours();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('room.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('room.subtitle')}
        </p>
      </header>
      <RoomCalendar viewerId={session.memberId} hours={hours} />
    </div>
  );
}
