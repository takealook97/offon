'use client';

import { useMemo } from 'react';
import { clippedDailyTotals, type SourceAttendance } from '@/lib/calendar-aggregation';
import { useTranslation } from '@/lib/i18n/client';
import { formatDuration } from '@/lib/i18n/format';
import { useMinuteTick } from './useMinuteTick';

/** The working spans touching today, serialised by the server. Times are UTC ISO strings. */
export type LiveRow = {
  status: SourceAttendance['status'];
  sessions: { startAt: string; endAt: string | null }[];
  breaks: { startAt: string; endAt: string | null }[];
};

/**
 * Recomputes today's net worked minutes in the browser, once a minute.
 *
 * A value serialised by the server freezes at render time, so leaving the page open shows a
 * worked figure that has stopped moving. `clippedDailyTotals` is pure, depending only on
 * date-fns, so the browser produces exactly the same result the server would and the figure
 * advances on the clock alone, with no round trip.
 *
 * An open session is clipped to now and so is a meal that has not finished, so the figure
 * climbs while working and holds still during a break or a meal, where both spans grow together.
 */
function useLiveTodayMinutes(rows: LiveRow[], dayKey: string): number {
  const now = useMinuteTick();
  return useMemo(() => {
    const parsed: SourceAttendance[] = rows.map((r) => ({
      status: r.status,
      sessions: r.sessions.map((s) => ({
        startAt: new Date(s.startAt),
        endAt: s.endAt ? new Date(s.endAt) : null,
      })),
      breaks: r.breaks.map((b) => ({
        startAt: new Date(b.startAt),
        endAt: b.endAt ? new Date(b.endAt) : null,
      })),
    }));
    return clippedDailyTotals(parsed, new Date(now))[dayKey]?.workedMinutes ?? 0;
  }, [rows, dayKey, now]);
}

/** The worked-time figure on the today card. */
export function TodayWorked({
  rows,
  dayKey,
  hasClockIn,
}: {
  rows: LiveRow[];
  dayKey: string;
  hasClockIn: boolean;
}) {
  const { t } = useTranslation();
  const minutes = useLiveTodayMinutes(rows, dayKey);
  return <>{hasClockIn ? formatDuration(t, minutes) : '—'}</>;
}

/** Week and month totals. `base` is the server total with today removed; only today's share is added live. */
export function RangeWorked({
  rows,
  dayKey,
  baseMinutes,
}: {
  rows: LiveRow[];
  dayKey: string;
  baseMinutes: number;
}) {
  const { t } = useTranslation();
  const minutes = useLiveTodayMinutes(rows, dayKey);
  return <>{formatDuration(t, baseMinutes + minutes)}</>;
}

/** The days-worked count for a week or month. The moment today rises above zero it has to count as a day. */
export function RangeWorkedDays({
  rows,
  dayKey,
  baseDays,
  emptyLabel,
}: {
  rows: LiveRow[];
  dayKey: string;
  baseDays: number;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const minutes = useLiveTodayMinutes(rows, dayKey);
  const days = baseDays + (minutes > 0 ? 1 : 0);
  if (days === 0 && emptyLabel) return <>{emptyLabel}</>;
  return <>{t('attendance.daysWorked', { days })}</>;
}
