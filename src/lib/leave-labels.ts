import type { MessageKey } from './i18n/dictionary';
import { formatKST } from '@/lib/time';

export type LeaveTypeValue = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

const TYPE_KEY: Record<LeaveTypeValue, MessageKey> = {
  FULL_DAY: 'appr.leave',
  HALF_DAY_AM: 'leave.amHalf',
  HALF_DAY_PM: 'leave.pmHalf',
};



/** The leave-type key used in notices. An unrecognised value falls back to a full day. */
export function leaveTypeKey(type: string): MessageKey {
  return TYPE_KEY[type as LeaveTypeValue] ?? TYPE_KEY.FULL_DAY;
}

/** Appends the weekday to a `yyyy-MM-dd` string, giving something like `'2026-08-27(Thu)'`. */
export function withWeekdayKST(dateStr: string, weekdays: readonly string[]): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = weekdays[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dateStr}(${weekday})`;
}

/** The date range used in notices, from local date strings. A single day reads as one date, with no dash. */
export function formatLeaveDateRangeKST(
  startStr: string,
  endStr: string,
  weekdays: readonly string[],
): string {
  return startStr === endStr
    ? withWeekdayKST(startStr, weekdays)
    : `${withWeekdayKST(startStr, weekdays)} ~ ${withWeekdayKST(endStr, weekdays)}`;
}

/** The date range used in notices, from Date values. */
export function formatLeaveDateRange(
  startDate: Date,
  endDate: Date,
  weekdays: readonly string[],
): string {
  return formatLeaveDateRangeKST(
    formatKST(startDate, 'yyyy-MM-dd'),
    formatKST(endDate, 'yyyy-MM-dd'),
    weekdays,
  );
}
