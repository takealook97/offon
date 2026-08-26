'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Calendar,
  type View,
  type ToolbarProps,
  Views,
} from 'react-big-calendar';
import { format, startOfWeek, getDay, isSameWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import {
  calendarMessages,
  WEEK_OPTS,
  formats,
  localizer,
} from '@/lib/rbc-localizer';
import type {
  CalendarEvent,
  CalendarEventsResponse,
  DailyAttendanceTotal,
} from '@/lib/api-types';
// CalendarEvent stays imported because UiEvent.resource infers its type through it.
import type { EditableSession } from '@/lib/attendance-edit';
import { CalendarToolbar } from './CalendarToolbar';
import { DateHeader } from './DateHeader';
import { ShowMoreDialog } from './ShowMoreDialog';
import { EditRequestDialog } from './EditRequestDialog';
import { PendingEditRequests } from './PendingEditRequests';
import { useTranslation } from '@/lib/i18n/client';
import {
  attendanceMinutesIn,
  formatMinutes,
  rangeForView,
  weeksInMonth,
} from './totals';

const VIEWS_ALLOWED: View[] = [Views.MONTH];

type UiEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: CalendarEvent['resource'];
};

function eventStyle(ev: UiEvent): string {
  if (ev.resource.kind === 'ATTENDANCE') {
    return 'rbc-event-attendance';
  }
  if (ev.resource.kind === 'LEAVE') {
    return ev.resource.leaveType === 'FULL_DAY'
      ? 'rbc-event-leave'
      : 'rbc-event-leave-half';
  }
  return 'rbc-event-missing';
}

function eventsOnDate(all: UiEvent[], d: Date): UiEvent[] {
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return all.filter((e) => e.start < dayEnd && e.end > dayStart);
}

export function CalendarView({ memberId }: { memberId?: number }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [dailyTotals, setDailyTotals] = useState<Record<string, DailyAttendanceTotal>>({});
  const [holidays, setHolidays] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [showMore, setShowMore] = useState<{ date: Date; events: UiEvent[] } | null>(null);
  const [editSession, setEditSession] = useState<EditableSession | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState(0);
  // Corrections and the pending list appear only on your own calendar, where no memberId is given.
  const canEdit = !memberId;

  const range = useMemo(() => {
    const start = new Date(date);
    start.setDate(1);
    start.setDate(start.getDate() - 7);
    const end = new Date(date);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });
    if (memberId) qs.set('memberId', String(memberId));
    setLoading(true);
    const fromStr = format(range.start, 'yyyy-MM-dd');
    const toStr = format(range.end, 'yyyy-MM-dd');
    Promise.all([
      fetch(`/api/calendar/events?${qs}`).then((r) => r.json()),
      fetch(`/api/holidays?from=${fromStr}&to=${toStr}`)
        .then((r) => r.json())
        .catch(() => ({ holidays: [] })),
    ])
      .then(([data, hData]: [CalendarEventsResponse, { holidays?: { date: string }[] }]) => {
        if (cancelled) return;
        if (data && 'ok' in data && data.ok) {
          setEvents(
            data.events.map((e) => ({
              id: e.id,
              title: e.title,
              start: new Date(e.start),
              end: new Date(e.end),
              allDay: e.allDay,
              resource: e.resource,
            })),
          );
          setDailyTotals(data.dailyTotals);
        } else {
          setEvents([]);
          setDailyTotals({});
          toast.error(
            (data && 'error' in data && data.error) || t('cal.loadFailed'),
          );
        }
        setHolidays(new Set((hData?.holidays ?? []).map((h) => h.date)));
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setDailyTotals({});
          setHolidays(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, memberId, t]);

  const eventPropGetter = useCallback((event: UiEvent) => {
    return { className: eventStyle(event) };
  }, []);

  const dayPropGetter = useCallback(
    (d: Date) => {
      const key = format(d, 'yyyy-MM-dd');
      const dow = getDay(d);
      const classes: string[] = [];
      if (dow === 0) classes.push('rbc-day-sun');
      else if (dow === 6) classes.push('rbc-day-sat');
      if (holidays.has(key)) classes.push('rbc-day-holiday');
      return classes.length ? { className: classes.join(' ') } : {};
    },
    [holidays],
  );

  const openDayModal = useCallback(
    (d: Date) => {
      const evts = eventsOnDate(events, d);
      if (evts.length === 0) return;
      setShowMore({ date: d, events: evts });
    },
    [events],
  );

  // Pressing correct in the modal loads the editable session and opens the correction dialog.
  const openEdit = useCallback((sessionId: number) => {
    setShowMore(null);
    fetch(`/api/attendance/edit/session?id=${sessionId}`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; session?: EditableSession; error?: string }) => {
        if (d?.ok && d.session) setEditSession(d.session);
        else toast.error(d?.error ?? t('cal.sessionLoadFailed'));
      })
      .catch(() => toast.error(t('cal.sessionLoadFailed')));
  }, [t]);

  const handleCellClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      // A click on an event bubble is resolved back to cell coordinates too, so a multi-day
      // leave opens on the cell actually clicked rather than on its first day.
      if (target.closest('.rbc-show-more')) return;
      const row = target.closest('.rbc-month-row') as HTMLElement | null;
      if (!row) return;
      const monthView = row.closest('.rbc-month-view') as HTMLElement | null;
      if (!monthView) return;
      const rows = Array.from(
        monthView.querySelectorAll('.rbc-month-row'),
      ) as HTMLElement[];
      const rowIdx = rows.indexOf(row);
      if (rowIdx < 0) return;
      const rect = row.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const colIdx = Math.min(6, Math.max(0, Math.floor((x / rect.width) * 7)));
      const firstDay = startOfWeek(
        new Date(date.getFullYear(), date.getMonth(), 1),
        WEEK_OPTS,
      );
      const clicked = new Date(firstDay);
      clicked.setDate(firstDay.getDate() + rowIdx * 7 + colIdx);
      openDayModal(clicked);
    },
    [date, openDayModal],
  );

  const viewMode: 'month' | 'week' | 'day' =
    view === Views.DAY ? 'day' : view === Views.WEEK ? 'week' : 'month';

  const Toolbar = useMemo(
    () => (props: ToolbarProps<UiEvent>) =>
      <CustomToolbar {...props} date={date} onJump={setDate} />,
    [date],
  );

  return (
    <div className="space-y-3 p-2 sm:p-4">
      <div
        className={cn(
          'h-[calc(100svh-220px)] min-h-[680px] transition-opacity sm:min-h-[520px]',
          loading && 'opacity-70',
        )}
        onClick={handleCellClick}
      >
        <Calendar
          localizer={localizer}
          culture="ko"
          formats={formats}
          events={events}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          startAccessor="start"
          endAccessor="end"
          allDayAccessor="allDay"
          eventPropGetter={eventPropGetter}
          dayPropGetter={dayPropGetter}
          views={VIEWS_ALLOWED}
          components={{
            toolbar: Toolbar,
            month: {
              dateHeader: (props) => (
                <DateHeader {...props} holidays={holidays} />
              ),
            },
          }}
          onDrillDown={(d) => openDayModal(d)}
          onShowMore={(_evts, d) => openDayModal(d)}
          doShowMoreDrillDown={false}
          messages={calendarMessages(t)}
          style={{ height: '100%' }}
        />
      </div>
      {viewMode === 'month' && (
        <WeeklySummary dailyTotals={dailyTotals} date={date} />
      )}
      {canEdit && <PendingEditRequests refreshKey={pendingRefresh} />}
      <ShowMoreDialog
        open={!!showMore}
        onOpenChange={(v) => !v && setShowMore(null)}
        date={showMore?.date ?? null}
        events={showMore?.events ?? []}
        summary={
          showMore ? dailyTotals[format(showMore.date, 'yyyy-MM-dd')] : undefined
        }
        canEdit={canEdit}
        onEdit={openEdit}
      />
      {editSession && (
        <EditRequestDialog
          key={editSession.id}
          session={editSession}
          open
          onOpenChange={(o) => !o && setEditSession(null)}
          onDone={() => setPendingRefresh((x) => x + 1)}
        />
      )}
    </div>
  );
}

function CustomToolbar(
  props: ToolbarProps<UiEvent> & {
    date: Date;
    onJump: (d: Date) => void;
  },
) {
  const { label, onNavigate, date, onJump } = props;
  return (
    <CalendarToolbar
      label={label as string}
      date={date}
      onPrev={() => onNavigate('PREV')}
      onNext={() => onNavigate('NEXT')}
      onToday={() => onNavigate('TODAY')}
      onJump={onJump}
    />
  );
}

function WeeklySummary({
  dailyTotals,
  date,
}: {
  dailyTotals: Record<string, DailyAttendanceTotal>;
  date: Date;
}) {
  const { t } = useTranslation();
  const today = new Date();
  const weeks = useMemo(() => weeksInMonth(date), [date]);
  const monthTotal = useMemo(
    () => attendanceMinutesIn(dailyTotals, rangeForView('month', date)),
    [dailyTotals, date],
  );

  return (
    <section className="rounded-lg border border-border/60 bg-card">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-muted-foreground">{t('cal.weeklySummary')}</h3>
        <span className="text-xs text-muted-foreground">
          <span className="mr-1">{t('cal.monthTotal')}</span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {formatMinutes(monthTotal)}
          </span>
        </span>
      </header>
      <ul className="divide-y divide-border/60">
        {weeks.map((w) => {
          const minutes = attendanceMinutesIn(dailyTotals, w);
          const isCurrent = isSameWeek(today, w.start, WEEK_OPTS);
          const isFuture = w.start.getTime() > today.getTime();
          return (
            <li
              key={w.start.toISOString()}
              className={cn(
                'flex items-center justify-between px-4 py-2.5 text-sm transition-colors',
                isCurrent && 'bg-accent/40',
              )}
            >
              <span className="font-mono tabular-nums text-muted-foreground">
                {format(w.start, 'M/d', { locale: ko })} –{' '}
                {format(w.end, 'M/d', { locale: ko })}
                {isCurrent && <span className="ml-2 text-xs text-foreground">{t('cal.thisWeek')}</span>}
              </span>
              <span
                className={cn(
                  'font-mono tabular-nums',
                  minutes > 0 ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {minutes > 0 ? formatMinutes(minutes) : isFuture ? '—' : t('cal.zeroMinutes')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
