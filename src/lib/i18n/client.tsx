'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { MESSAGES, translate, type MessageKey } from './dictionary';
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from './locale';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Passes the locale the server read from the cookie down through the client tree.
 * It has to match what the server rendered or hydration will not line up, so the client
 * trusts this prop rather than reading the cookie again.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function useTranslation() {
  const locale = useContext(LocaleContext);
  const messages = MESSAGES[locale];

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(messages, key, vars),
    [messages],
  );

  /**
   * Writes the cookie and reloads. Strings rendered by server components have to change too,
   * so swapping client state alone is not enough.
   */
  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    window.location.reload();
  }, []);

  return useMemo(() => ({ t, locale, setLocale }), [t, locale, setLocale]);
}
