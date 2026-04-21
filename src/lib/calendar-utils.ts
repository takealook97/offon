export function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `Date`의 UTC 연월일을 그대로 취해 KST(+09:00) ISO 문자열로 반환.
 * Prisma `@db.Date`는 UTC 자정 Date로 읽히므로 UTC getters가 곧 달력 일자.
 */
export function kstIsoFromDate(d: Date, h = 0, min = 0): string {
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  return `${y}-${m}-${day}T${pad(h)}:${pad(min)}:00+09:00`;
}

export function addDaysUtc(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

export function halfDayIsoRange(
  workDate: Date,
  type: 'HALF_DAY_AM' | 'HALF_DAY_PM',
) {
  if (type === 'HALF_DAY_AM') {
    return { start: kstIsoFromDate(workDate, 9), end: kstIsoFromDate(workDate, 13) };
  }
  return { start: kstIsoFromDate(workDate, 13), end: kstIsoFromDate(workDate, 18) };
}
