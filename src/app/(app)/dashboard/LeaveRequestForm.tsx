'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
// The front end and the request route decide **weekends by the same rule**,
// so both use the shared helpers in `@/lib/time`. That module depends on nothing but date-fns and
// has no server-only imports, so it is safe to pull across the 'use client' boundary.
// If the client and the server compute differently, the form offers a count the server then refuses,
// The original is shared rather than copied locally.
import { countBusinessDaysKST, isBusinessDayKSTDateStr } from '@/lib/time';

type LeaveType = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';
type LeaveCategory = 'ANNUAL' | 'PUBLIC_DUTY';
type OptionKey = 'ANNUAL_FULL' | 'ANNUAL_AM' | 'ANNUAL_PM' | 'PUBLIC_DUTY';

// Public duty is one category in the database now; it used to be two.
// The UI shows the friendly label while the request carries the category value.
const OPTIONS: {
  key: OptionKey;
  label: string;
  type: LeaveType;
  category: LeaveCategory;
}[] = [
  { key: 'ANNUAL_FULL', label: 'Leave', type: 'FULL_DAY', category: 'ANNUAL' },
  { key: 'ANNUAL_AM', label: 'Morning half day', type: 'HALF_DAY_AM', category: 'ANNUAL' },
  { key: 'ANNUAL_PM', label: 'Afternoon half day', type: 'HALF_DAY_PM', category: 'ANNUAL' },
  { key: 'PUBLIC_DUTY', label: 'Public duty', type: 'FULL_DAY', category: 'PUBLIC_DUTY' },
];

function subjectParticle(word: string): '\uc774' | '\uac00' {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return '\uac00';
  return (ch - 0xac00) % 28 === 0 ? '\uac00' : '\uc774';
}

export function LeaveRequestForm({
  availableDays,
  holidayDates,
  todayStr,
}: {
  availableDays: number;
  holidayDates: string[];
  todayStr: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<OptionKey>('ANNUAL_FULL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const option = OPTIONS.find((o) => o.key === selected)!;
  const { type, category, label: selectedLabel } = option;

  const holidays = useMemo(() => new Set(holidayDates), [holidayDates]);

  const missingEndDate = type === 'FULL_DAY' && !!startDate && !endDate;
  const missingStartDate = type === 'FULL_DAY' && !startDate && !!endDate;

  const requestedDays = useMemo(() => {
    if (!startDate) return 0;
    if (type !== 'FULL_DAY') {
      return isBusinessDayKSTDateStr(startDate, holidays) ? 0.5 : 0;
    }
    if (!endDate) return 0;
    return countBusinessDaysKST(startDate, endDate, holidays);
  }, [type, startDate, endDate, holidays]);

  // The balance is only checked for annual leave. Public duty must be submittable even at zero remaining.
  const exceeds = category === 'ANNUAL' && requestedDays > availableDays;
  const invalidRange = type === 'FULL_DAY' && startDate && endDate && endDate < startDate;
  const isPast = !!startDate && startDate < todayStr;
  const startIsNonBusiness =
    !!startDate && !isBusinessDayKSTDateStr(startDate, holidays);
  const endIsNonBusiness =
    type === 'FULL_DAY' &&
    !!endDate &&
    !isBusinessDayKSTDateStr(endDate, holidays);
  const canSubmit =
    !!startDate &&
    !missingEndDate &&
    !missingStartDate &&
    requestedDays > 0 &&
    !exceeds &&
    !invalidRange &&
    !isPast &&
    !startIsNonBusiness &&
    !endIsNonBusiness;

  const submit = () =>
    start(async () => {
      const body = {
        type,
        category,
        startDate,
        endDate: type === 'FULL_DAY' ? endDate : startDate,
      };
      const res = await fetch('/api/leave/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Request failed');
        return;
      }
      toast.success(`${selectedLabel} requested`);
      setStartDate('');
      setEndDate('');
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setSelected(opt.key)}
            aria-label={opt.label}
            className={cn(
              'h-9 rounded-full border px-3.5 text-sm transition-colors',
              selected === opt.key
                ? 'border-foreground bg-foreground text-background'
                : 'border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {type === 'FULL_DAY' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              min={todayStr}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 w-full"
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="endDate">End date</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              min={startDate || todayStr}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11 w-full"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 sm:max-w-[16rem]">
          <Label htmlFor="startDate">Date</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            min={todayStr}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11 w-full"
          />
        </div>
      )}

      <div
        className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
          exceeds ||
            invalidRange ||
            isPast ||
            startIsNonBusiness ||
            endIsNonBusiness ||
            missingEndDate ||
            missingStartDate
            ? 'border-destructive/40 bg-destructive/5 text-destructive'
            : 'border-border/60 bg-muted/40 text-muted-foreground',
        )}
      >
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <div className="space-y-0.5">
          {category === 'ANNUAL' ? (
            <p>
              Available <span className="font-mono tabular-nums">{availableDays}</span>Day
              {startDate && (
                <>
                  {' '}
                  · requested <span className="font-mono tabular-nums">{requestedDays}</span>d
                </>
              )}
            </p>
          ) : (
            <p>
              {selectedLabel} does not come out of your balance
              {startDate && (
                <>
                  {' '}
                  · requested <span className="font-mono tabular-nums">{requestedDays}</span>d
                </>
              )}
            </p>
          )}
          {missingEndDate && (
            <p className="text-destructive">Pick an end date</p>
          )}
          {missingStartDate && (
            <p className="text-destructive">Pick a start date</p>
          )}
          {exceeds && <p className="text-destructive">That exceeds your available leave</p>}
          {invalidRange && <p className="text-destructive">The end date is before the start date</p>}
          {isPast && <p className="text-destructive">A date in the past cannot be requested</p>}
          {startIsNonBusiness && (
            <p className="text-destructive">
              {type === 'FULL_DAY'
                ? 'The start date cannot be a weekend or a holiday'
                : 'A half day cannot be requested on a weekend or a holiday'}
            </p>
          )}
          {endIsNonBusiness && (
            <p className="text-destructive">
              The end date cannot be a weekend or a holiday
            </p>
          )}
        </div>
      </div>

      <Button
        type="button"
        disabled={pending || !canSubmit}
        onClick={submit}
        className="h-11 w-full sm:w-auto"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : `${selectedLabel} Requesting`}
      </Button>
    </div>
  );
}
