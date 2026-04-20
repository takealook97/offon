import { format as fnsFormat } from 'date-fns';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
} from 'date-fns';
import { ko } from 'date-fns/locale';

// 앱은 Asia/Seoul 고정(DST 없음). date-fns-tz 없이 UTC+9 상수로 처리.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 주어진 시각을 "KST wall-clock" Date로 반환한다.
 * 서버 시계가 UTC인 Vercel 환경에서 Date의 getFullYear/Hours 등이 KST 값을 내도록
 * UTC epoch에 +9h 만큼 shift한 Date를 만든다. 이 Date는 직접 toISOString()으로
 * 전송하면 안 되며, 오직 format()·get* 계열에만 사용한다.
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
