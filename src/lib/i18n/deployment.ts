import { MESSAGES, translate, type MessageKey } from './dictionary';
import { normalizeLocale, type Locale } from './locale';

/**
 * The deployment's default language.
 *
 * Used where there is **no request cookie**: Slack DMs, slash-command replies, cron notices.
 * Giving each person their own language would need a per-member locale, but one deployment
 * serves one organisation and an organisation speaks one language, so this is an environment
 * variable rather than another column.
 *
 * An unset or unrecognised value falls back to `DEFAULT_LOCALE`.
 */
export function getDeploymentLocale(): Locale {
  return normalizeLocale(process.env.DEFAULT_LOCALE);
}

/** The `t` for use outside a request context. Same signature as the one the UI uses. */
export function getDeploymentT() {
  const messages = MESSAGES[getDeploymentLocale()];
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(messages, key, vars);
}
