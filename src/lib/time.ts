import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';

export const TZ = 'Asia/Seoul';

export function nowKST(): Date {
  return toZonedTime(new Date(), TZ);
}

export function todayKST(): Date {
  return startOfDay(nowKST());
}

export function formatKST(d: Date, fmt = 'yyyy-MM-dd HH:mm'): string {
  return formatInTimeZone(d, TZ, fmt, { locale: ko });
}

export function weekRangeKST(ref: Date = nowKST()): { start: Date; end: Date } {
  return {
    start: startOfWeek(ref, { weekStartsOn: 1 }),
    end: endOfWeek(ref, { weekStartsOn: 1 }),
  };
}

export function monthRangeKST(ref: Date = nowKST()): { start: Date; end: Date } {
  return {
    start: startOfMonth(ref),
    end: endOfMonth(ref),
  };
}

export function isWeekdayKST(d: Date = nowKST()): boolean {
  const dow = toZonedTime(d, TZ).getDay();
  return dow >= 1 && dow <= 5;
}
