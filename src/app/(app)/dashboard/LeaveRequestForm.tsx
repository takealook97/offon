'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Matcher } from 'react-day-picker';
import { Loader2, Info, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
// The front end and the request route decide **weekends by the same rule**,
// so both use the shared helpers in `@/lib/time`. That module depends on nothing but date-fns and
// has no server-only imports, so it is safe to pull across the 'use client' boundary.
import { countBusinessDaysKST, isBusinessDayKSTDateStr } from '@/lib/time';

type LeaveType = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

const TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: 'FULL_DAY', label: 'Full day' },
  { value: 'HALF_DAY_AM', label: 'Morning' },
  { value: 'HALF_DAY_PM', label: 'Afternoon' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s: string): Date | undefined =>
  s ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : undefined;

function DateField({
  value,
  onChange,
  minYmd,
  holidays,
}: {
  value: string;
  onChange: (ymd: string) => void;
  minYmd: string;
  holidays: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromYmd(value);
  const minDate = fromYmd(minYmd);

  // Past dates, weekends and holidays cannot be picked, the same rule the server applies. Non-business days inside a range drop out of the count automatically.
  const disabled: Matcher[] = [
    ...(minDate ? [{ before: minDate }] : []),
    (d: Date) => d.getDay() === 0 || d.getDay() === 6,
    (d: Date) => holidays.has(toYmd(d)),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full min-w-0 justify-start gap-2 px-3 font-normal"
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="truncate">{format(selected!, 'yyyy-MM-dd (EEE)', { locale: ko })}</span>
          ) : (
            <span className="text-muted-foreground">Pick a date</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (!d) return;
            onChange(toYmd(d));
            setOpen(false);
          }}
          defaultMonth={selected ?? minDate}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
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
  const [type, setType] = useState<LeaveType>('FULL_DAY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  const exceeds = requestedDays > availableDays;
  const invalidRange = type === 'FULL_DAY' && startDate && endDate && endDate < startDate;
  const isPast = !!startDate && startDate < todayStr;
  const startIsNonBusiness = !!startDate && !isBusinessDayKSTDateStr(startDate, holidays);
  const endIsNonBusiness =
    type === 'FULL_DAY' && !!endDate && !isBusinessDayKSTDateStr(endDate, holidays);
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
      toast.success('Leave requested');
      setStartDate('');
      setEndDate('');
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setType(opt.value)}
            className={cn(
              'h-9 cursor-pointer rounded-full border px-3.5 text-sm transition-colors',
              type === opt.value
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
            <Label>Start date</Label>
            <DateField value={startDate} onChange={setStartDate} minYmd={todayStr} holidays={holidays} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label>End date</Label>
            <DateField
              value={endDate}
              onChange={setEndDate}
              minYmd={startDate || todayStr}
              holidays={holidays}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 sm:max-w-[16rem]">
          <Label>Date</Label>
          <DateField value={startDate} onChange={setStartDate} minYmd={todayStr} holidays={holidays} />
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
          <p>
            Available <span className="font-mono tabular-nums">{availableDays}</span>Day
            {startDate && (
              <>
                {' '}
                · requested <span className="font-mono tabular-nums">{requestedDays}</span>d
              </>
            )}
          </p>
          {missingEndDate && <p className="text-destructive">Pick an end date</p>}
          {missingStartDate && <p className="text-destructive">Pick a start date</p>}
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
            <p className="text-destructive">The end date cannot be a weekend or a holiday</p>
          )}
        </div>
      </div>

      <Button
        type="button"
        disabled={pending || !canSubmit}
        onClick={submit}
        className="h-11 w-full sm:w-auto"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : type === 'FULL_DAY' ? (
          'Request leave'
        ) : (
          'Request half day'
        )}
      </Button>
    </div>
  );
}
