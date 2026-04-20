'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Calendar,
  dateFnsLocalizer,
  type View,
  type ToolbarProps,
  Views,
} from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CalendarEvent, CalendarEventsResponse } from '@/lib/api-types';
import { CalendarToolbar } from './CalendarToolbar';
import { ShowMoreDialog } from './ShowMoreDialog';

const WEEK_OPTS = { weekStartsOn: 0 as const };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, WEEK_OPTS),
  getDay,
  locales: { ko },
});

const formats = {
  monthHeaderFormat: (date: Date) => format(date, 'yyyy년 M월', { locale: ko }),
  weekdayFormat: (date: Date) => format(date, 'EEE', { locale: ko }),
  dayFormat: (date: Date) => format(date, 'd일 (EEE)', { locale: ko }),
};

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
  if (ev.resource.leaveType === 'FULL_DAY') return 'rbc-event-leave';
  return 'rbc-event-leave-half';
}

export function TeamCalendarView() {
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
    fetch(`/api/team/leaves?${qs}`)
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
  }, [range.start, range.end]);

  const eventPropGetter = useCallback(
    (event: UiEvent) => ({ className: eventStyle(event) }),
    [],
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
          components={{ toolbar: CustomToolbar }}
          onShowMore={(evts, d) =>
            setShowMore({ date: d, events: evts as UiEvent[] })
          }
          doShowMoreDrillDown={false}
          messages={{
            month: '월',
            today: '오늘',
            previous: '이전',
            next: '다음',
            noEventsInRange: '이 기간에 연차 일정이 없습니다',
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

function CustomToolbar(props: ToolbarProps<UiEvent>) {
  const { label, onNavigate } = props;
  return (
    <CalendarToolbar
      label={label as string}
      onPrev={() => onNavigate('PREV')}
      onNext={() => onNavigate('NEXT')}
      onToday={() => onNavigate('TODAY')}
    />
  );
}
