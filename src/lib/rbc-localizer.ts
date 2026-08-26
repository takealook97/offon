import { dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS, ko } from 'date-fns/locale';
import type { MessageKey } from './i18n/dictionary';

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
  monthHeaderFormat: (date: Date) => format(date, 'yyyy-MM', { locale: ko }),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'yyyy-MM-dd', { locale: ko })} – ${format(end, 'dd', { locale: ko })}`,
  dayHeaderFormat: (date: Date) => format(date, 'yyyy-MM-dd (EEEE)', { locale: ko }),
  weekdayFormat: (date: Date) => format(date, 'EEE', { locale: ko }),
  dayFormat: (date: Date) => format(date, 'd (EEE)', { locale: ko }),
  timeGutterFormat: (date: Date) => format(date, 'HH:mm', { locale: ko }),
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'HH:mm', { locale: ko })} ~ ${format(end, 'HH:mm', { locale: ko })}`,
  agendaDateFormat: (date: Date) => format(date, 'MMM d (EEE)', { locale: ko }),
  agendaTimeFormat: (date: Date) => format(date, 'HH:mm', { locale: ko }),
  agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'HH:mm', { locale: ko })} – ${format(end, 'HH:mm', { locale: ko })}`,
};

/**
 * The calendar's own wording. RBC uses these labels internally even where the view-switching
 * buttons are hidden. They have to follow the language, so this takes `t` rather than being a constant.
 */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function calendarMessages(t: Translate) {
  return {
    month: t('rbc.month'),
    week: t('rbc.week'),
    day: t('rbc.day'),
    today: t('cal.today'),
    previous: t('cal.prev'),
    next: t('cal.next'),
    agenda: t('rbc.agenda'),
    date: t('rbc.date'),
    time: t('rbc.time'),
    event: t('rbc.event'),
    noEventsInRange: t('rbc.noEventsInRange'),
  };
}
