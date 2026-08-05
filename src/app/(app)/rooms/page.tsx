import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { RoomCalendar } from './RoomCalendar';

export default async function RoomsPage() {
  // (app)/layout.tsx already guards the session, but the viewerId has to be resolved here to pass it down.
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Rooms</h1>
        <p className="text-sm text-muted-foreground">
          Click or drag an empty slot to book it
        </p>
      </header>
      <RoomCalendar viewerId={session.memberId} />
    </div>
  );
}
