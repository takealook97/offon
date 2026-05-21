'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AttendanceEditActions({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const act = (path: string, okMsg: string) =>
    start(async () => {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'That did not work');
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => act('/api/attendance/edit/approve', 'Approved')}
        disabled={pending}
        className="gap-1.5"
      >
        <Check className="size-4" />
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => act('/api/attendance/edit/reject', 'Rejected')}
        disabled={pending}
        className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        <X className="size-4" />
        Reject
      </Button>
    </div>
  );
}
