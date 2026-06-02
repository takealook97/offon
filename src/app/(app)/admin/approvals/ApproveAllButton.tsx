'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ApproveAllItem = { kind: 'leave' | 'att'; id: number };

export function ApproveAllButton({ items }: { items: ApproveAllItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

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
      const failed = results.filter((r) => !r.ok);
      // Success shows as the list emptying, so only failures are announced.
      if (failed.length > 0) {
        toast.error(
          `${failed.length} refused${failed[0].error ? ` (${failed[0].error})` : ''}`,
        );
      }
      router.refresh();
    });

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={run}
      disabled={pending || items.length === 0}
      className="ml-auto gap-1.5"
    >
      <CheckCheck className="size-4" />
      Approve all
    </Button>
  );
}
