'use client';

import { LogIn, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function AttendanceActions({
  hasClockIn,
  hasClockOut,
}: {
  hasClockIn: boolean;
  hasClockOut: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const call = (path: string, successMsg: string) =>
    start(async () => {
      const res = await fetch(path, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Request failed');
        return;
      }
      toast.success(successMsg);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button
        type="button"
        size="lg"
        disabled={pending || hasClockIn}
        onClick={() => call('/api/attendance/clock-in', 'Clocked in')}
        className="h-11 flex-1 gap-2"
      >
        <LogIn className="size-4" />
        Clock in
      </Button>
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled={pending || !hasClockIn || hasClockOut}
        onClick={() => call('/api/attendance/clock-out', 'Clocked out')}
        className="h-11 flex-1 gap-2"
      >
        <LogOut className="size-4" />
        Clock out
      </Button>
    </div>
  );
}
