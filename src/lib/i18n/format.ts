import type { MessageKey } from './dictionary';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Writes a duration in minutes the way the locale does: `90` becomes `'1h 30m'` in English.
 *
 * With no hours it prints only minutes, and with no minutes only hours, because '1h 0m'
 * reads badly in either language. Badges and cards all over the app need the same notation,
 * so it lives here rather than in each component.
 */
export function formatDuration(t: Translate, minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h > 0 && m > 0) return t('duration.hm', { h, m });
  if (h > 0) return t('duration.h', { h });
  return t('duration.m', { m });
}
