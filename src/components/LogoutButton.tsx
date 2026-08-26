'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n/client';

export function LogoutButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          router.replace('/login');
          router.refresh();
        })
      }
      className={cn('gap-2', className)}
    >
      <LogOut className="size-4" />
      {t('nav.logout')}
    </Button>
  );
}
