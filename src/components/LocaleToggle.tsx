'use client';

import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/client';
import { LOCALES, LOCALE_LABEL } from '@/lib/i18n/locale';

/**
 * The language switcher. With only two languages it is a toggle rather than a dropdown.
 * Same place and same size as ThemeToggle, so the two read as a pair in the header.
 */
export function LocaleToggle() {
  const { t, locale, setLocale } = useTranslation();
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLocale(next)}
      aria-label={`${t('locale.switch')} (${t('locale.current', { name: LOCALE_LABEL[locale] })})`}
      title={LOCALE_LABEL[next]}
    >
      <Languages className="size-4" />
    </Button>
  );
}
