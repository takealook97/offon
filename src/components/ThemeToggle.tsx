'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const label = !mounted ? 'Switch theme' : isDark ? 'Dark' : 'Light';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={!mounted ? 'Switch theme' : `Switch theme (currently ${label})`}
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
