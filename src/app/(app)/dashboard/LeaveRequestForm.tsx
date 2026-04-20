'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';

type LeaveType = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

const TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: 'FULL_DAY', label: '종일' },
  { value: 'HALF_DAY_AM', label: '오전' },
  { value: 'HALF_DAY_PM', label: '오후' },
];

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const d1 = new Date(a);
  const d2 = new Date(b);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 0;
  return Math.max(0, Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1);
}

export function LeaveRequestForm({ availableDays }: { availableDays: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState<LeaveType>('FULL_DAY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const requestedDays = useMemo(() => {
    if (type !== 'FULL_DAY') return 0.5;
    return daysBetween(startDate, endDate || startDate);
  }, [type, startDate, endDate]);

  const exceeds = requestedDays > availableDays;
  const invalidRange = type === 'FULL_DAY' && startDate && endDate && endDate < startDate;
  const isPast = !!startDate && startDate < todayStr;
  const canSubmit = !!startDate && requestedDays > 0 && !exceeds && !invalidRange && !isPast;

  const submit = () =>
    start(async () => {
      const body = {
        type,
        startDate,
        endDate: type === 'FULL_DAY' ? endDate || startDate : startDate,
        reason: reason || undefined,
      };
      const res = await fetch('/api/leave/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? '요청 실패');
        return;
      }
      toast.success('연차가 신청되었습니다');
      setStartDate('');
      setEndDate('');
      setReason('');
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
              'h-9 rounded-full border px-3.5 text-sm transition-colors',
              type === opt.value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">{type === 'FULL_DAY' ? '시작일' : '날짜'}</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            min={todayStr}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11"
          />
        </div>
        {type === 'FULL_DAY' && (
          <div className="space-y-1.5">
            <Label htmlFor="endDate">종료일</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              min={startDate || todayStr}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11"
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reason">
          {type === 'FULL_DAY' ? '연차 사유' : '반차 사유'}
        </Label>
        <Input
          id="reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="(선택)"
          className="h-11"
        />
      </div>

      <div
        className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
          exceeds || invalidRange || isPast
            ? 'border-destructive/40 bg-destructive/5 text-destructive'
            : 'border-border/60 bg-muted/40 text-muted-foreground',
        )}
      >
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <div className="space-y-0.5">
          <p>
            사용 가능 연차 <span className="font-mono tabular-nums">{availableDays}</span>일
            {startDate && (
              <>
                {' '}
                · 신청 <span className="font-mono tabular-nums">{requestedDays}</span>일
              </>
            )}
          </p>
          {exceeds && <p className="text-destructive">사용 가능 연차를 초과했습니다</p>}
          {invalidRange && <p className="text-destructive">종료일이 시작일보다 빠릅니다</p>}
          {isPast && <p className="text-destructive">과거 날짜는 신청할 수 없습니다</p>}
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
          '연차 신청'
        ) : (
          '반차 신청'
        )}
      </Button>
    </div>
  );
}
