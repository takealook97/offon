import { dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';

/**
 * Shared react-big-calendar configuration, kept in one place so the attendance month view
 * kept in one place so both write dates the same way. A pure constant, bound to no props or state.
 */

/** Weeks start on Sunday. The calendar grid and the weekly summary have to agree on this. */
export const WEEK_OPTS = { weekStartsOn: 0 as const };

export const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, WEEK_OPTS),
  getDay,
  locales: { ko },
});

export const formats = {
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

/** The calendar's own wording. The library uses these labels internally even where the view switcher is hidden. */
export const CALENDAR_MESSAGES = {
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
};
