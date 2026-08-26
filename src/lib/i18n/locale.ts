/**
 * The supported locales and the cookie convention.
 *
 * Server components read the key from `cookies()` and the client from `document.cookie`.
 * Unlike the session cookie it is not signed: it only chooses a display language, carries no
 * authority, and a corrupted value simply falls back to `DEFAULT_LOCALE`.
 */
export const LOCALES = ['ko', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ko';

export const LOCALE_COOKIE = 'locale';

/** Narrows an arbitrary string from a cookie or header to a supported locale, defaulting when unrecognised. */
export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const lower = value.toLowerCase();
  const exact = LOCALES.find((locale) => locale === lower);
  if (exact) return exact;
  // Region-tagged values such as 'en-US' and 'ko-KR' are accepted too.
  const base = lower.split('-')[0];
  return LOCALES.find((locale) => locale === base) ?? DEFAULT_LOCALE;
}

/** Human-readable language names, each written in its own language so it is recognisable in the switcher. */
export const LOCALE_LABEL: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
};
