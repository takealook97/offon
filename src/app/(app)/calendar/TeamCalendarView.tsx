'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Calendar,
  type View,
  type ToolbarProps,
  Views,
} from 'react-big-calendar';
import { format, startOfWeek, getDay } from 'date-fns';
import { toast } from 'sonner';
import type { CalendarEvent, CalendarEventsResponse } from '@/lib/api-types';
import { WEEK_OPTS, calendarFormats, localizer } from '@/lib/rbc-localizer';
import { CalendarToolbar } from './CalendarToolbar';
import { DateHeader } from './DateHeader';
import { ShowMoreDialog } from './ShowMoreDialog';
import { useTranslation } from '@/lib/i18n/client';

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
  if (ev.resource.kind !== 'LEAVE') return '';
  if (ev.resource.leaveType === 'FULL_DAY') return 'rbc-event-leave';
  return 'rbc-event-leave-half';
}

function eventsOnDate(all: UiEvent[], d: Date): UiEvent[] {
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return all.filter((e) => e.start < dayEnd && e.end > dayStart);
}

export function TeamCalendarView() {
  const { t, locale } = useTranslation();
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [showMore, setShowMore] = useState<{ date: Date; events: UiEvent[] } | null>(null);
  const ToolbarWithJump = useMemo(
    () => {
      // react/display-name: an anonymous arrow component shows up nameless in DevTools.
      function ToolbarWithJump(props: ToolbarProps<UiEvent>) {
        return <CustomToolbar {...props} date={date} onJump={setDate} />;
      }
      return ToolbarWithJump;
    },
    [date],
  );

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
    // This screen fetches inside an effect rather than through a data library. The loading flag
    // is set immediately before the request, which is not the cascading render the lint rule warns about.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const fromStr = format(range.start, 'yyyy-MM-dd');
    const toStr = format(range.end, 'yyyy-MM-dd');
    Promise.all([
      fetch(`/api/team/leaves?${qs}`).then((r) => r.json()),
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
        } else {
          setEvents([]);
          toast.error(
            (data && 'error' in data && data.error) || t('cal.teamLoadFailed'),
          );
        }
        setHolidays(new Set((hData?.holidays ?? []).map((h) => h.date)));
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setHolidays(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, t]);

  const eventPropGetter = useCallback(
    (event: UiEvent) => ({ className: eventStyle(event) }),
    [],
  );

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

  return (
    <div className="space-y-3 p-2 sm:p-4">
      <div
        className={`h-[calc(100svh-220px)] min-h-[680px] transition-opacity sm:min-h-[520px] ${
          loading ? 'opacity-70' : ''
        }`}
        onClick={handleCellClick}
      >
        <Calendar
          localizer={localizer}
          culture="ko"
          formats={calendarFormats(locale)}
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
            toolbar: ToolbarWithJump,
            month: {
              dateHeader: (props) => (
                <DateHeader {...props} holidays={holidays} />
              ),
            },
          }}
          onDrillDown={(d) => openDayModal(d)}
          onShowMore={(_evts, d) => openDayModal(d)}
          doShowMoreDrillDown={false}
          messages={{
            month: t('cal.month'),
            today: t('cal.today'),
            previous: t('cal.prev'),
            next: t('cal.next'),
            noEventsInRange: t('cal.noEventsInRange'),
          }}
          style={{ height: '100%' }}
        />
      </div>
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
  props: ToolbarProps<UiEvent> & { date: Date; onJump: (d: Date) => void },
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
