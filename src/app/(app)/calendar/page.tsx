import { Card } from '@/components/ui/card';
import { CalendarView } from './CalendarView';

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">캘린더</h1>
          <p className="text-sm text-muted-foreground">나의 근태·연차·누락 기록</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend dotClass="bg-emerald-500" label="출근" />
          <Legend dotClass="bg-blue-500" label="연차" />
          <Legend dotClass="bg-amber-500" label="연차 대기" />
          <Legend dotClass="bg-red-500" label="누락" />
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
