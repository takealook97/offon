import { dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS, ko } from 'date-fns/locale';
import type { MessageKey } from './i18n/dictionary';

/**
 * Shared react-big-calendar configuration, kept in one place so the attendance month view
 * and the meeting-room week grid write dates the same way.
 *
 * Weekday names are language-dependent, so `formats` is a function of the locale rather than
 * a constant. The localizer itself registers both locales once and never needs rebuilding.
 */

/** Weeks start on Sunday. The calendar grid and the weekly summary have to agree on this. */
export const WEEK_OPTS = { weekStartsOn: 0 as const };

export const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, WEEK_OPTS),
  getDay,
  locales: { ko, en: enUS },
});

export function calendarFormats(locale: 'ko' | 'en') {
  const fnsLocale = locale === 'en' ? enUS : ko;
  return {
  monthHeaderFormat: (date: Date) => format(date, 'yyyy-MM', { locale: fnsLocale }),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'yyyy-MM-dd', { locale: fnsLocale })} – ${format(end, 'dd', { locale: fnsLocale })}`,
  dayHeaderFormat: (date: Date) => format(date, 'yyyy-MM-dd (EEEE)', { locale: fnsLocale }),
  weekdayFormat: (date: Date) => format(date, 'EEE', { locale: fnsLocale }),
  dayFormat: (date: Date) => format(date, 'd (EEE)', { locale: fnsLocale }),
  timeGutterFormat: (date: Date) => format(date, 'HH:mm', { locale: fnsLocale }),
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'HH:mm', { locale: fnsLocale })} ~ ${format(end, 'HH:mm', { locale: fnsLocale })}`,
  agendaDateFormat: (date: Date) => format(date, 'MMM d (EEE)', { locale: fnsLocale }),
  agendaTimeFormat: (date: Date) => format(date, 'HH:mm', { locale: fnsLocale }),
  agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'HH:mm', { locale: fnsLocale })} – ${format(end, 'HH:mm', { locale: fnsLocale })}`,
  };
}

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
