'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function CancelLeaveButton({
  id,
  wasApproved,
}: {
  id: number;
  wasApproved: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const cancel = () =>
    start(async () => {
      const res = await fetch('/api/leave/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? t('leave.cancelFailed'));
        return;
      }
      toast.success(t('leave.cancelled'));
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        {t('leave.cancel')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('leave.cancelTitle')}</DialogTitle>
            <DialogDescription>
              {wasApproved
                ? t('leave.cancelApprovedConfirm')
                : t('leave.cancelConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('leave.cancelBack')}
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={pending}>
              {pending ? t('leave.cancelling') : t('leave.cancelDo')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
