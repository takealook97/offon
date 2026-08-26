'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/client';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  // The server does not know the viewer's theme, so the icon can only be settled after the
  // first paint. This setState is the hydration-avoidance pattern next-themes documents.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const label = !mounted ? t('theme.toggle') : isDark ? t('theme.dark') : t('theme.light');

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={!mounted ? t('theme.toggle') : t('theme.toggleCurrent', { mode: label })}
      title={label}
      suppressHydrationWarning
    >
      <span suppressHydrationWarning>
        {mounted ? (
          isDark ? <Moon className="size-4" /> : <Sun className="size-4" />
        ) : (
          <Sun className="size-4 opacity-0" />
        )}
      </span>
    </Button>
  );
}
