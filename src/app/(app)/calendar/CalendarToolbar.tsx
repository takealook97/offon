'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { MonthPicker } from './MonthPicker';

export function CalendarToolbar({
  label,
  date,
  onPrev,
  onNext,
  onToday,
  onJump,
  right,
}: {
  label: string;
  date?: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onJump?: (d: Date) => void;
  right?: ReactNode;
}) {
  const TitleEl = date && onJump ? (
    <div className="order-first w-full text-center sm:order-none sm:w-auto sm:justify-self-center">
      <MonthPicker date={date} label={label} onPick={onJump} />
    </div>
  ) : (
    <h2 className="order-first w-full text-center text-base font-semibold sm:order-none sm:w-auto sm:justify-self-center sm:text-lg">
      {label}
    </h2>
  );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 sm:grid sm:grid-cols-3">
      <div className="flex items-center gap-1.5 sm:justify-self-start">
        <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Previous">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNext} aria-label="Next">
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
      </div>
      {TitleEl}
      <div className="sm:justify-self-end">{right ?? <span />}</div>
    </div>
  );
}
