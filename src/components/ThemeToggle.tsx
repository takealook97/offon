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
    current === 'light' ? '라이트 모드' : current === 'dark' ? '다크 모드' : '시스템 설정';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={next}
      aria-label={`테마 변경 (현재: ${label})`}
      title={label}
    >
      {current === 'light' && <Sun className="size-4" />}
      {current === 'dark' && <Moon className="size-4" />}
      {current === 'system' && <Monitor className="size-4" />}
    </Button>
  );
}
