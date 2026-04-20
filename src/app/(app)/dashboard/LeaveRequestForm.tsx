'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';

type LeaveType = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

const TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: 'FULL_DAY', label: '종일' },
  { value: 'HALF_DAY_AM', label: '오전 반차' },
  { value: 'HALF_DAY_PM', label: '오후 반차' },
];

export function LeaveRequestForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState<LeaveType>('FULL_DAY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

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
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11"
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reason">사유 (선택)</Label>
        <Input
          id="reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="연차 사유 (선택)"
          className="h-11"
        />
      </div>

      <Button
        type="button"
        disabled={pending || !startDate}
        onClick={submit}
        className="h-11 w-full sm:w-auto"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : '연차 신청'}
      </Button>
    </div>
  );
}
