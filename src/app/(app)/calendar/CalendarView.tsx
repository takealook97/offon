'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Calendar,
  dateFnsLocalizer,
  type View,
  type ToolbarProps,
  Views,
} from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, isSameWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { CalendarEvent, CalendarEventsResponse } from '@/lib/api-types';
import { CalendarToolbar } from './CalendarToolbar';
import { ShowMoreDialog } from './ShowMoreDialog';
import {
  attendanceMinutesIn,
  formatMinutes,
  rangeForView,
  weeksInMonth,
} from './totals';

const WEEK_OPTS = { weekStartsOn: 0 as const };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, WEEK_OPTS),
  getDay,
  locales: { ko },
});

const VIEWS_ALLOWED: View[] = [Views.MONTH];

const formats = {
  monthHeaderFormat: (date: Date) => format(date, 'yyyy년 M월', { locale: ko }),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'yyyy년 M월 d일', { locale: ko })} – ${format(end, 'd일', { locale: ko })}`,
  dayHeaderFormat: (date: Date) => format(date, 'yyyy년 M월 d일 (EEEE)', { locale: ko }),
  weekdayFormat: (date: Date) => format(date, 'EEE', { locale: ko }),
  dayFormat: (date: Date) => format(date, 'd일 (EEE)', { locale: ko }),
  timeGutterFormat: (date: Date) => format(date, 'HH:mm', { locale: ko }),
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'HH:mm', { locale: ko })} ~ ${format(end, 'HH:mm', { locale: ko })}`,
  agendaDateFormat: (date: Date) => format(date, 'M월 d일 (EEE)', { locale: ko }),
  agendaTimeFormat: (date: Date) => format(date, 'HH:mm', { locale: ko }),
  agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'HH:mm', { locale: ko })} – ${format(end, 'HH:mm', { locale: ko })}`,
};

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
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [showMore, setShowMore] = useState<{ date: Date; events: UiEvent[] } | null>(null);

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
    fetch(`/api/calendar/events?${qs}`)
      .then((r) => r.json())
      .then((data: CalendarEventsResponse) => {
        if (cancelled || !data?.events) return;
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
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, memberId]);

  const eventPropGetter = useCallback((event: UiEvent) => {
    return { className: eventStyle(event) };
  }, []);

  const openDayModal = useCallback(
    (d: Date) => {
      const evts = eventsOnDate(events, d);
      if (evts.length === 0) return;
      setShowMore({ date: d, events: evts });
    },
    [events],
  );

  const handleCellClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest('.rbc-event')) return;
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

  // Agenda 뷰도 월 기준 집계(배지·주별 요약)로 매핑
  const viewMode: 'month' | 'week' | 'day' =
    view === Views.DAY ? 'day' : view === Views.WEEK ? 'week' : 'month';

  const apiEvents: CalendarEvent[] = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        allDay: e.allDay,
        resource: e.resource,
      })),
    [events],
  );

  const totalMinutes = useMemo(
    () => attendanceMinutesIn(apiEvents, rangeForView(viewMode, date)),
    [apiEvents, viewMode, date],
  );

  const totalLabel = useMemo(() => {
    if (viewMode === 'month') return format(date, 'M월', { locale: ko });
    if (viewMode === 'week') {
      const r = rangeForView('week', date);
      return `${format(r.start, 'M/d', { locale: ko })} – ${format(r.end, 'M/d', { locale: ko })}`;
    }
    return format(date, 'M/d (EEE)', { locale: ko });
  }, [viewMode, date]);

  const Toolbar = useMemo(
    () => (props: ToolbarProps<UiEvent>) =>
      (
        <CustomToolbar
          {...props}
          totalMinutes={totalMinutes}
          totalLabel={totalLabel}
          date={date}
          onJump={setDate}
        />
      ),
    [totalMinutes, totalLabel, date],
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
          views={VIEWS_ALLOWED}
          components={{ toolbar: Toolbar }}
          onSelectEvent={(ev) => openDayModal((ev as UiEvent).start)}
          onDrillDown={(d) => openDayModal(d)}
          onShowMore={(evts, d) =>
            setShowMore({ date: d, events: evts as UiEvent[] })
          }
          doShowMoreDrillDown={false}
          messages={{
            month: '월',
            week: '주',
            day: '일',
            today: '오늘',
            previous: '이전',
            next: '다음',
            agenda: '목록',
            date: '날짜',
            time: '시간',
            event: '이벤트',
            noEventsInRange: '이 기간에 일정이 없습니다',
          }}
          style={{ height: '100%' }}
        />
      </div>
      {viewMode === 'month' && (
        <WeeklySummary apiEvents={apiEvents} date={date} />
      )}
      <ShowMoreDialog
        open={!!showMore}
        onOpenChange={(v) => !v && setShowMore(null)}
        date={showMore?.date ?? null}
        events={showMore?.events ?? []}
      />
    </div>
  );
}

function CustomToolbar(
  props: ToolbarProps<UiEvent> & {
    totalMinutes: number;
    totalLabel: string;
    date: Date;
    onJump: (d: Date) => void;
  },
) {
  const { label, onNavigate, totalMinutes, totalLabel, date, onJump } = props;
  return (
    <CalendarToolbar
      label={label as string}
      date={date}
      onPrev={() => onNavigate('PREV')}
      onNext={() => onNavigate('NEXT')}
      onToday={() => onNavigate('TODAY')}
      onJump={onJump}
      right={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium">
          <Clock className="size-3 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{totalLabel}</span>
          <span className="font-mono tabular-nums">{formatMinutes(totalMinutes)}</span>
        </span>
      }
    />
  );
}

function WeeklySummary({
  apiEvents,
  date,
}: {
  apiEvents: CalendarEvent[];
  date: Date;
}) {
  const today = new Date();
  const weeks = useMemo(() => weeksInMonth(date), [date]);
  const monthTotal = useMemo(
    () => attendanceMinutesIn(apiEvents, rangeForView('month', date)),
    [apiEvents, date],
  );

  return (
    <section className="rounded-lg border border-border/60 bg-card">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-muted-foreground">주별 요약</h3>
        <span className="text-xs text-muted-foreground">
          <span className="mr-1">월 합계</span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {formatMinutes(monthTotal)}
          </span>
        </span>
      </header>
      <ul className="divide-y divide-border/60">
        {weeks.map((w) => {
          const minutes = attendanceMinutesIn(apiEvents, w);
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
                {isCurrent && <span className="ml-2 text-xs text-foreground">(이번 주)</span>}
              </span>
              <span
                className={cn(
                  'font-mono tabular-nums',
                  minutes > 0 ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {minutes > 0 ? formatMinutes(minutes) : isFuture ? '—' : '0분'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
