'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/client';

export function AttendanceEditActions({ id }: { id: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();

  const act = (path: string, okMsg: string) =>
    start(async () => {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        warning?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? t('appr.actionFailed'));
        return;
      }
      toast.success(okMsg);
      // The attendance change landed but the scheduled Slack notice is out of step, so the admin is told as well.
      if (data.warning) toast.warning(data.warning);
      router.refresh();
    });

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => act('/api/attendance/edit/approve', t('appr.approved'))}
        disabled={pending}
        className="gap-1.5"
      >
        <Check className="size-4" />
        {t('appr.approve')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => act('/api/attendance/edit/reject', t('appr.rejected'))}
        disabled={pending}
        className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        <X className="size-4" />
        {t('appr.reject')}
      </Button>
    </div>
  );
}
