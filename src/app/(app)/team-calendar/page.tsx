import { Card } from '@/components/ui/card';
import { TeamCalendarView } from './TeamCalendarView';

export default function TeamCalendarPage() {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team calendar</h1>
          <p className="text-sm text-muted-foreground">Approved leave across the team</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend dotClass="bg-blue-500" label="Full day Leave" />
          <Legend dotClass="bg-sky-400" label="Half day" />
        </div>
      </header>
      <Card className="p-0">
        <TeamCalendarView />
      </Card>
    </div>
  );
}

function Legend({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
