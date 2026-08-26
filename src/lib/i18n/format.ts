import type { MessageKey } from './dictionary';

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

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

/** Renders a validation failure as prose. */
export type Failure = {
  messageKey: MessageKey;
  vars?: Record<string, string | number>;
  /** For when a value going into the message is itself translatable, such as a meal or a break. */
  kindKey?: MessageKey;
};

/**
 * A placeholder sometimes takes a value that needs translating itself, so the domain
 * leaves a key there and it is resolved one layer further here. Otherwise the screen prints the raw key.
 */
export function translateFailure(t: Translate, failure: Failure): string {
  const vars = failure.kindKey
    ? { ...failure.vars, kind: t(failure.kindKey) }
    : failure.vars;
  return t(failure.messageKey, vars);
}
