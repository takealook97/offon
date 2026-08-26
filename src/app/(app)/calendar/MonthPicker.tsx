'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n/dictionary';



export function MonthPicker({
  date,
  label,
  onPick,
}: {
  date: Date;
  label: string;
  onPick: (next: Date) => void;
}) {
  const { t } = useTranslation();
  const months = Array.from({ length: 12 }, (_, i) => t(`month.${i + 1}` as MessageKey));
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
          aria-label={t('cal.jumpMonth')}
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
            aria-label={t('cal.prevYear')}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-semibold tabular-nums">{t('cal.yearLabel', { year: pickerYear })}</span>
          <button
            type="button"
            onClick={() => setPickerYear((y) => y + 1)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t('cal.nextYear')}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {months.map((m, idx) => {
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
