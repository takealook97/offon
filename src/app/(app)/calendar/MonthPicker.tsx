'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export function MonthPicker({
  date,
  label,
  onPick,
}: {
  date: Date;
  label: string;
  onPick: (next: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(date.getFullYear());
  const today = new Date();
  const curMonth = date.getMonth();
  const curYear = date.getFullYear();

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setPickerYear(date.getFullYear());
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-md px-2 py-0.5 text-base font-semibold tracking-tight transition-colors hover:bg-accent sm:text-lg"
          aria-label="연월 빠르게 이동"
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[260px] p-3">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPickerYear((y) => y - 1)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="이전 해"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-semibold tabular-nums">{pickerYear}년</span>
          <button
            type="button"
            onClick={() => setPickerYear((y) => y + 1)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="다음 해"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((m, idx) => {
            const isCurrent = pickerYear === curYear && idx === curMonth;
            const isToday = pickerYear === today.getFullYear() && idx === today.getMonth();
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  onPick(new Date(pickerYear, idx, 1));
                  setOpen(false);
                }}
                className={cn(
                  'rounded-md py-2 text-sm transition-colors',
                  isCurrent
                    ? 'bg-foreground text-background font-medium'
                    : isToday
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
