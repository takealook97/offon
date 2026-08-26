import { cookies } from 'next/headers';
import { MESSAGES, translate, type MessageKey, type Messages } from './dictionary';
import { LOCALE_COOKIE, normalizeLocale, type Locale } from './locale';

/**
 * Reading the locale from a server component or a route handler.
 * `cookies()` is asynchronous in Next 16, so every one of these has to be awaited.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

export async function getMessages(): Promise<Messages> {
  return MESSAGES[await getLocale()];
}

/** The server-side `t`, with the same signature as the client's `useTranslation().t`. */
export async function getT() {
  const messages = await getMessages();
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(messages, key, vars);
}
