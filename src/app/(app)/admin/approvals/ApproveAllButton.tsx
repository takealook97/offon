'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type ApproveAllItem = { kind: 'leave' | 'att'; id: number };

export function ApproveAllButton({ items }: { items: ApproveAllItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  const run = () =>
    start(async () => {
      const results = await Promise.all(
        items.map(async (it) => {
          const url =
            it.kind === 'leave' ? '/api/leave/approve' : '/api/attendance/edit/approve';
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: it.id }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              error?: string;
            };
            return { ok: res.ok && data.ok === true, error: data.error };
          } catch (err) {
            return { ok: false, error: String(err) };
          }
        }),
      );
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      const firstError = results.find((r) => !r.ok)?.error;
      if (failCount === 0) {
        toast.success(`All ${okCount} approved`);
      } else if (okCount === 0) {
        toast.error(firstError ?? `${failCount} could not be approved`);
      } else {
        toast.warning(`${okCount} approved · ${failCount} failed${firstError ? ` (${firstError})` : ''}`);
      }
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
        className="ml-auto gap-1.5"
      >
        <CheckCheck className="size-4" />
        Approve all
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve all</DialogTitle>
            <DialogDescription>
              Approves all {items.length} waiting. Anything where someone is away, or where the record changed after the request, may be refused automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelled
            </Button>
            <Button onClick={run} disabled={pending}>
              {pending ? 'Approving…' : `Approve ${items.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
