'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';
  const label = isDark ? 'Dark' : 'Light';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={`Switch theme (currently ${label})`}
      title={label}
    >
      {mounted ? (
        isDark ? <Moon className="size-4" /> : <Sun className="size-4" />
      ) : (
        <Sun className="size-4 opacity-0" />
      )}
    </Button>
  );
}
