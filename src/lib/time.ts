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

/**
 * `YYYY-MM-DD` 문자열이 KST 기준 주말(토·일)인지 판정.
 *
 * 달력 날짜 자체의 요일은 타임존에 의존하지 않는다(2026-04-25는 어느 나라에서든 토요일).
 * 따라서 UTC 자정으로 고정 파싱해 `getUTCDay()`로 요일을 뽑는다.
 * (과거 `+09:00`로 파싱하면 UTC epoch가 전일 15:00Z로 앞당겨져
 *  `getUTCDay()`가 **전날 요일**을 반환하는 1일 shift 버그가 있었음.)
 * 0=일, 6=토.
 */
export function isWeekendKSTDateStr(s: string): boolean {
  const dow = new Date(`${s}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * KST 기준 `start`~`end` (양끝 포함) 범위 내 평일(월~금) 일수.
 * 두 인자는 `YYYY-MM-DD` 문자열이며, end < start면 0을 반환한다.
 *
 * 달력 날짜 요일은 타임존 무관하므로 UTC 자정 기준으로 한 칸씩 전진한다.
 * 시작점이 UTC 자정이면 24h 스텝 중 DST·윤초가 끼어들 여지가 없다.
 */
export function countWeekdaysKST(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  if (e.getTime() < s.getTime()) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  let count = 0;
  for (let t = s.getTime(); t <= e.getTime(); t += dayMs) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}
