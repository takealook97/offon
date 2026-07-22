'use client';

import { Coffee, LogIn, LogOut, Undo2, UtensilsCrossed } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type Status = 'NOT_STARTED' | 'WORKING' | 'ON_BREAK' | 'DONE' | 'MISSING';

// Tighter padding and gaps, so on a narrow screen the icon and spacing do not crowd out the label.
const BTN = 'h-11 w-full min-w-0 gap-1.5 px-2 sm:gap-2 sm:px-4';
// A button that cannot be used right now. Truly disabling it swallows the click and leaves
// no way to say why, so it only looks disabled and the click still fires a toast explaining.
const BLOCKED = 'opacity-50';
const ICON = 'size-4 shrink-0';

export function AttendanceActions({
  status,
  lunchEndsAt,
}: {
  status: Status;
  /** When a meal in progress ends, as a UTC ISO string. Its presence means a meal is running. */
  lunchEndsAt?: string | null;
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

  const isOnLunch = !!lunchEndsAt;
  // The meal end is a snapshot from the server render and may already have passed before the next refresh.
  // The server already allows clocking out and stepping away by then, so this is measured again at click time.
  const lunchOngoing = () =>
    !!lunchEndsAt && new Date(lunchEndsAt).getTime() > Date.now();
  const isOnBreak = status === 'ON_BREAK';
  const isWorking = status === 'WORKING';
  // One toggle for clocking in and out. It reads as on while working, including breaks and meals.
  const isOn = isWorking || isOnBreak;
  // Clocking out waits for a break to end, or for a meal to finish.
  const toggleBlocked = isOnBreak || isOnLunch;

  const remainingLunchMin = () =>
    Math.max(1, Math.ceil((new Date(lunchEndsAt!).getTime() - Date.now()) / 60_000));

  // Come back from a break, or wait out a meal, before clocking out. The server enforces the same.
  // Disabling it swallows the click and hides the reason, so it stays pressable and explains.
  const onToggle = () => {
    if (lunchOngoing()) {
      toast.info(`You cannot clock out during a meal. It ends by itself in ${remainingLunchMin()} minutes.`);
      return;
    }
    if (isOnBreak) {
      toast.info('You cannot clock out while away. Come back first.');
      return;
    }
    if (isOn) {
      call('/api/attendance/clock-out', 'Clocked out');
      return;
    }
    call('/api/attendance/clock-in', 'Clocked in');
  };

  const onLunch = () => {
    // There is nothing to come back from on a meal. Pressing it sends no request and just says how long is left.
    if (lunchOngoing()) {
      toast.info(`It ends by itself in ${remainingLunchMin()} minutes.`);
      return;
    }
    call('/api/attendance/lunch', 'Meal started');
  };

  const onBreakToggle = () => {
    if (lunchOngoing()) {
      toast.info(`That cannot be used during a meal. It ends by itself in ${remainingLunchMin()} minutes.`);
      return;
    }
    if (isOnBreak) {
      call('/api/attendance/back', 'Welcome back');
      return;
    }
    call('/api/attendance/break', 'Marked away');
  };

  return (
    // A three-column grid sizes each cell equally regardless of what is inside.
    // With flex-1 the min-width:auto default kept a long label from shrinking below its own content width.
    <div className="grid grid-cols-3 gap-2">
      <Button
        type="button"
        size="lg"
        variant={isOn ? 'outline' : 'default'}
        disabled={pending}
        onClick={onToggle}
        aria-pressed={isOn}
        aria-disabled={toggleBlocked}
        className={cn(BTN, toggleBlocked && BLOCKED)}
      >
        {isOn ? <LogOut className={ICON} /> : <LogIn className={ICON} />}
        <span className="truncate">{isOn ? 'Clock out' : 'Clock in'}</span>
      </Button>
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled={pending || (!isWorking && !isOnLunch)}
        onClick={onLunch}
        aria-disabled={isOnLunch}
        className={cn(BTN, isOnLunch && BLOCKED)}
      >
        <UtensilsCrossed className={ICON} />
        <span className="truncate">Meal</span>
      </Button>
      <Button
        type="button"
        size="lg"
        variant={isOnBreak ? 'default' : 'outline'}
        disabled={pending || !(isWorking || isOnBreak)}
        onClick={onBreakToggle}
        aria-disabled={isOnLunch}
        className={cn(BTN, isOnLunch && BLOCKED)}
      >
        {isOnBreak ? <Undo2 className={ICON} /> : <Coffee className={ICON} />}
        <span className="truncate">{isOnBreak ? 'Back' : 'Away'}</span>
      </Button>
    </div>
  );
}
