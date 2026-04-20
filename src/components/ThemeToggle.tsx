'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

const ORDER = ['light', 'dark', 'system'] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const current = (ORDER.includes(theme as (typeof ORDER)[number])
    ? theme
    : 'system') as (typeof ORDER)[number];

  const next = () => {
    const idx = ORDER.indexOf(current);
    setTheme(ORDER[(idx + 1) % ORDER.length]);
  };

  const label =
    current === 'light' ? 'Light' : current === 'dark' ? 'Dark' : 'System';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={next}
      aria-label={`Switch theme (currently ${label})`}
      title={label}
    >
      {current === 'light' && <Sun className="size-4" />}
      {current === 'dark' && <Moon className="size-4" />}
      {current === 'system' && <Monitor className="size-4" />}
    </Button>
  );
}
