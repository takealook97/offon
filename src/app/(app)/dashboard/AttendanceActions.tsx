'use client';

import { Coffee, LogIn, LogOut, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Status = 'NOT_STARTED' | 'WORKING' | 'ON_BREAK' | 'DONE' | 'MISSING';

export function AttendanceActions({ status }: { status: Status }) {
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

  const canClockIn = status === 'NOT_STARTED' || status === 'DONE' || status === 'MISSING';
  const canClockOut = status === 'WORKING';
  const canToggleBreak = status === 'WORKING' || status === 'ON_BREAK';
  const isOnBreak = status === 'ON_BREAK';

  return (
    <div className="flex flex-row gap-2">
      <Button
        type="button"
        size="lg"
        disabled={pending || !canClockIn}
        onClick={() => call('/api/attendance/clock-in', 'Clocked in')}
        className="h-11 flex-1 gap-2"
      >
        <LogIn className="size-4" />
        Clock in
      </Button>
      <Button
        type="button"
        size="lg"
        variant="secondary"
        disabled={pending || !canToggleBreak}
        onClick={() =>
          isOnBreak
            ? call('/api/attendance/back', 'Welcome back')
            : call('/api/attendance/break', 'Marked away')
        }
        className="h-11 flex-1 gap-2"
      >
        {isOnBreak ? <Undo2 className="size-4" /> : <Coffee className="size-4" />}
        {isOnBreak ? 'Back' : 'Away'}
      </Button>
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled={pending || !canClockOut}
        onClick={() => call('/api/attendance/clock-out', 'Clocked out')}
        className="h-11 flex-1 gap-2"
      >
        <LogOut className="size-4" />
        Clock out
      </Button>
    </div>
  );
}
