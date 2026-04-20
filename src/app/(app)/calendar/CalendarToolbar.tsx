'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function CalendarToolbar({
  label,
  onPrev,
  onNext,
  onToday,
  right,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  right?: ReactNode;
}) {
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
      <h2 className="order-first w-full text-center text-base font-semibold sm:order-none sm:w-auto sm:justify-self-center sm:text-lg">
        {label}
      </h2>
      <div className="sm:justify-self-end">{right ?? <span />}</div>
    </div>
  );
}
