'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { CalendarView } from './CalendarView';
import { TeamCalendarView } from './TeamCalendarView';

type Mode = 'personal' | 'team';

export function CalendarTabs() {
  const [mode, setMode] = useState<Mode>('personal');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-md bg-muted p-0.5">
          <TabButton label="내 캘린더" active={mode === 'personal'} onClick={() => setMode('personal')} />
          <TabButton label="팀 캘린더" active={mode === 'team'} onClick={() => setMode('team')} />
        </div>
        {mode === 'personal' ? <PersonalLegend /> : <TeamLegend />}
      </div>
      <Card className="p-0">
        {mode === 'personal' ? <CalendarView /> : <TeamCalendarView />}
      </Card>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm font-medium'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function PersonalLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <Dot cls="bg-emerald-500" label="출근" />
      <Dot cls="bg-blue-500" label="연차" />
    </div>
  );
}

function TeamLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <Dot cls="bg-blue-500" label="종일 연차" />
      <Dot cls="bg-sky-400" label="반차" />
    </div>
  );
}

function Dot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${cls}`} />
      {label}
    </span>
  );
}
