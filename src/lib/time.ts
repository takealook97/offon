import { format as fnsFormat } from 'date-fns';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
} from 'date-fns';
import { ko } from 'date-fns/locale';

// The app is pinned to one timezone with no daylight saving, handled as a fixed offset.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * The given instant as a Date whose fields read as the local wall clock.
 * On a server whose clock is UTC, this makes the Date getters return local values by
 * shifting the UTC epoch by the offset. Never send this Date anywhere via toISOString();
 * via toISOString(); use it only with format() and the get* family.
 */
function kstShifted(d: Date = new Date()): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

export function nowKST(): Date {
  return kstShifted();
}

export function todayKST(): Date {
  return startOfDay(nowKST());
}

export function formatKST(d: Date, fmt = 'yyyy-MM-dd HH:mm'): string {
  return fnsFormat(kstShifted(d), fmt, { locale: ko });
}

export function weekRangeKST(ref: Date = nowKST()): { start: Date; end: Date } {
  return {
    start: startOfWeek(ref, { weekStartsOn: 0 }),
    end: endOfWeek(ref, { weekStartsOn: 0 }),
  };
}

export function monthRangeKST(ref: Date = nowKST()): { start: Date; end: Date } {
  return {
    start: startOfMonth(ref),
    end: endOfMonth(ref),
  };
}

export function isWeekdayKST(d: Date = nowKST()): boolean {
  const dow = kstShifted(d).getDay();
  return dow >= 1 && dow <= 5;
}
