import { formatKST } from '@/lib/time';

export type LeaveTypeValue = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

const TYPE_LABEL: Record<LeaveTypeValue, string> = {
  FULL_DAY: 'Leave',
  HALF_DAY_AM: 'Morning half day',
  HALF_DAY_PM: 'Afternoon half day',
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The leave-type label used in notices. An unrecognised value falls back to plain leave. */
export function leaveTypeLabel(type: string): string {
  return TYPE_LABEL[type as LeaveTypeValue] ?? TYPE_LABEL.FULL_DAY;
}

/** Appends the weekday to a `yyyy-MM-dd` string, giving something like `'2026-08-27(Thu)'`. */
export function withWeekdayKST(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = WEEKDAY_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dateStr}(${weekday})`;
}

/** The date range used in notices, from local date strings. A single day reads as one date, with no dash. */
export function formatLeaveDateRangeKST(startStr: string, endStr: string): string {
  return startStr === endStr
    ? withWeekdayKST(startStr)
    : `${withWeekdayKST(startStr)} ~ ${withWeekdayKST(endStr)}`;
}

/** The date range used in notices, from Date values. */
export function formatLeaveDateRange(startDate: Date, endDate: Date): string {
  return formatLeaveDateRangeKST(
    formatKST(startDate, 'yyyy-MM-dd'),
    formatKST(endDate, 'yyyy-MM-dd'),
  );
}
