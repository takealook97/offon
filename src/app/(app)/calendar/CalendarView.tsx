'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CalendarEvent, CalendarEventsResponse } from '@/lib/api-types';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { ko },
});

type UiEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: CalendarEvent['resource'];
};

function colorFor(ev: UiEvent): string {
  switch (ev.resource.kind) {
    case 'ATTENDANCE':
      return '#10b981';
    case 'LEAVE':
      return ev.resource.leaveStatus === 'REQUESTED' ? '#f59e0b' : '#3b82f6';
    case 'MISSING':
      return '#ef4444';
  }
}

export function CalendarView() {
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());

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
  }, [range.start, range.end]);

  const eventStyleGetter = useCallback(
    (event: UiEvent) => ({
      style: {
        backgroundColor: colorFor(event),
        borderColor: colorFor(event),
        color: 'white',
      },
    }),
    [],
  );

  return (
    <div className="h-[75vh] rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <Calendar
        localizer={localizer}
        culture="ko"
        events={events}
        view={view}
        onView={setView}
        date={date}
        onNavigate={setDate}
        startAccessor="start"
        endAccessor="end"
        allDayAccessor="allDay"
        eventPropGetter={eventStyleGetter}
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
  );
}
