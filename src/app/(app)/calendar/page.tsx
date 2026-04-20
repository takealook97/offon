import { Card } from '@/components/ui/card';
import { CalendarView } from './CalendarView';

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">Your attendance, leave and missing records</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend dotClass="bg-emerald-500" label="Clock in" />
          <Legend dotClass="bg-blue-500" label="Leave" />
          <Legend dotClass="bg-amber-500" label="Leave pending" />
          <Legend dotClass="bg-red-500" label="Missing" />
        </div>
      </header>
      <Card className="p-0">
        <CalendarView />
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
