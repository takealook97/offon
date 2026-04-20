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
  monthHeaderFormat: (date: Date) => format(date, 'MMMM yyyy'),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'd MMMM yyyy')} – ${format(end, 'd')}`,
  dayHeaderFormat: (date: Date) => format(date, 'EEEE, d MMMM yyyy', { locale: ko }),
  weekdayFormat: (date: Date) => format(date, 'EEE', { locale: ko }),
  dayFormat: (date: Date) => format(date, 'dDay (EEE)', { locale: ko }),
  timeGutterFormat: (date: Date) => format(date, 'HH:mm', { locale: ko }),
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'HH:mm', { locale: ko })} ~ ${format(end, 'HH:mm', { locale: ko })}`,
  agendaDateFormat: (date: Date) => format(date, 'MMonth dDay (EEE)', { locale: ko }),
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

export function CalendarView({ memberId }: { memberId?: number }) {
  const [events, setEvents] = useState<UiEvent[]>([]);
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
    const qs = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });
    if (memberId) qs.set('memberId', String(memberId));
    fetch(`/api/calendar/events?${qs}`)
      .then((r) => r.json())
      .then((data: CalendarEventsResponse) => {
        if (!data?.events) return;
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
      .catch(() => setEvents([]));
  }, [range.start, range.end, memberId]);

  const eventPropGetter = useCallback((event: UiEvent) => {
    return { className: eventStyle(event) };
  }, []);

  // The agenda view maps onto the month aggregation too, for the badge and the weekly summary
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
    if (viewMode === 'month') return format(date, 'MMonth', { locale: ko });
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
      <div className="h-[calc(100svh-220px)] min-h-[520px]">
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
          onShowMore={(evts, d) =>
            setShowMore({ date: d, events: evts as UiEvent[] })
          }
          doShowMoreDrillDown={false}
          messages={{
            month: 'Month',
            week: 'Week',
            day: 'Day',
            today: 'Today',
            previous: 'Previous',
            next: 'Next',
            agenda: 'Agenda',
            date: 'Date',
            time: 'Time',
            event: 'Event',
            noEventsInRange: 'Nothing in this range',
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
        <h3 className="text-sm font-semibold text-muted-foreground">Weekly summary</h3>
        <span className="text-xs text-muted-foreground">
          <span className="mr-1">Month total</span>
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
                {isCurrent && <span className="ml-2 text-xs text-foreground">(this week)</span>}
              </span>
              <span
                className={cn(
                  'font-mono tabular-nums',
                  minutes > 0 ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {minutes > 0 ? formatMinutes(minutes) : isFuture ? '—' : '0m'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
