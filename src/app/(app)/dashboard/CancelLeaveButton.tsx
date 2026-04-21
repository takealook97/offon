'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
        toast.error(data.error ?? 'Could not cancel that');
        return;
      }
      toast.success('Cancelled');
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
        Cancelled
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel leave request</DialogTitle>
            <DialogDescription>
              {wasApproved
                ? 'Cancelling approved leave returns the days to your balance. Continue?'
                : 'Cancel this request?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Go back
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={pending}>
              {pending ? 'Working…' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
