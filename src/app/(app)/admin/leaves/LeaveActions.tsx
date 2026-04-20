'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function LeaveActions({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const approve = () =>
    start(async () => {
      const res = await fetch('/api/leave/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Could not approve that');
        return;
      }
      toast.success('Approved');
      router.refresh();
    });

  const reject = () =>
    start(async () => {
      const res = await fetch('/api/leave/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, reason: reason || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Could not reject that');
        return;
      }
      toast.success('Rejected');
      setRejectOpen(false);
      setReason('');
      router.refresh();
    });

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={approve} disabled={pending} className="gap-1.5">
          <Check className="size-4" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRejectOpen(true)}
          disabled={pending}
          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <X className="size-4" />
          Reject
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
            <DialogDescription>The reason is DM\'d to the requester on Slack (optional).</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. clashes with the project deadline and needs rescheduling"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={pending}>
              Cancelled
            </Button>
            <Button variant="destructive" onClick={reject} disabled={pending}>
              {pending ? 'Working…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
