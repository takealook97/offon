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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
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

function eventStyle(ev: UiEvent): string {
  if (ev.resource.kind === 'ATTENDANCE') {
    return 'rbc-event-attendance';
  }
  if (ev.resource.kind === 'LEAVE') {
    return ev.resource.leaveStatus === 'REQUESTED'
      ? 'rbc-event-leave-pending'
      : 'rbc-event-leave';
  }
  return 'rbc-event-missing';
}

export function CalendarView() {
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [view, setView] = useState<View>(Views.MONTH);
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

  const eventPropGetter = useCallback((event: UiEvent) => {
    return { className: eventStyle(event) };
  }, []);

  return (
    <div className="p-2 sm:p-4">
      <div className="h-[calc(100svh-220px)] min-h-[520px]">
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
          eventPropGetter={eventPropGetter}
          components={{ toolbar: CustomToolbar }}
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
    </div>
  );
}

const VIEW_LABEL: Record<string, string> = {
  month: '월',
  week: '주',
  day: '일',
  agenda: '목록',
};

function CustomToolbar(props: ToolbarProps<UiEvent>) {
  const { label, onNavigate, onView, view, views } = props;
  const viewList = Array.isArray(views)
    ? views
    : (Object.keys(views).filter((v) => (views as Record<string, boolean>)[v]) as View[]);

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onNavigate('PREV')}
          aria-label="이전"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onNavigate('NEXT')}
          aria-label="다음"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onNavigate('TODAY')}>
          오늘
        </Button>
      </div>
      <h2 className="order-first w-full text-center text-base font-semibold sm:order-none sm:w-auto sm:text-lg">
        {label}
      </h2>
      <div className="flex gap-1 rounded-md bg-muted p-0.5">
        {viewList.map((v) => (
          <button
            key={v as string}
            type="button"
            onClick={() => onView(v as View)}
            className={cn(
              'rounded px-2.5 py-1 text-xs transition-colors',
              view === v
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {VIEW_LABEL[v as string] ?? (v as string)}
          </button>
        ))}
      </div>
    </div>
  );
}
