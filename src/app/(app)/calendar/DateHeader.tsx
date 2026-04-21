'use client';

import { format, getDay } from 'date-fns';
import { cn } from '@/lib/cn';

type DateHeaderProps = {
  date: Date;
  label: string;
  drilldownView: string | null;
  onDrillDown: (e: React.MouseEvent<HTMLElement>) => void;
  isOffRange?: boolean;
  holidays: ReadonlySet<string>;
};

export function DateHeader({
  date,
  label,
  drilldownView,
  onDrillDown,
  isOffRange,
  holidays,
}: DateHeaderProps) {
  const key = format(date, 'yyyy-MM-dd');
  const dow = getDay(date);
  const isHoliday = holidays.has(key);
  const colorClass =
    isHoliday || dow === 0
      ? 'rbc-date-sun'
      : dow === 6
      ? 'rbc-date-sat'
      : '';
  if (!drilldownView) {
    return <span className={cn('rbc-button-link', colorClass)}>{label}</span>;
  }
  return (
    <button
      type="button"
      className={cn('rbc-button-link', colorClass)}
      onClick={onDrillDown}
      aria-disabled={isOffRange}
    >
      {label}
    </button>
  );
}
