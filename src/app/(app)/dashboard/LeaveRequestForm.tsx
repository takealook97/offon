'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
// BE(`src/app/api/leave/request/route.ts`)와 FE가 **동일한 KST 주말 판정 규칙**을
// 공유하도록 `@/lib/time`의 공용 헬퍼를 사용한다. `time.ts`는 date-fns만 쓰고
// server-only 의존성이 없어 'use client' 경계에서도 안전하게 import 가능하다.
// 서버와 클라 계산이 달라지면 "폼은 N일인데 서버는 거부" 같은 회귀가 발생하므로
// 로컬 복제 대신 원본을 공유한다.
import { countBusinessDaysKST, isBusinessDayKSTDateStr } from '@/lib/time';

type LeaveType = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

const TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: 'FULL_DAY', label: '종일' },
  { value: 'HALF_DAY_AM', label: '오전' },
  { value: 'HALF_DAY_PM', label: '오후' },
];

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
    // 반차: 시작일이 주말/공휴일이면 신청 불가(0), 평일이면 0.5일.
    if (type !== 'FULL_DAY') {
      return isBusinessDayKSTDateStr(startDate, holidays) ? 0.5 : 0;
    }
    // 종일: 시작일·종료일 모두 있어야 계산. BE `countBusinessDaysKST`와 동일 규칙.
    if (!endDate) return 0;
    return countBusinessDaysKST(startDate, endDate, holidays);
  }, [type, startDate, endDate, holidays]);

  const exceeds = requestedDays > availableDays;
  const invalidRange = type === 'FULL_DAY' && startDate && endDate && endDate < startDate;
  const isPast = !!startDate && startDate < todayStr;
  // 시작일/종료일 각각 주말·공휴일이면 차단. 범위 중간의 비영업일은 BE와 동일하게 일수에서 자동 제외.
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
        toast.error(data.error ?? '요청 실패');
        return;
      }
      toast.success('연차가 신청되었습니다');
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

      {type === 'FULL_DAY' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="startDate">시작일</Label>
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
            <Label htmlFor="endDate">종료일</Label>
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
          <Label htmlFor="startDate">날짜</Label>
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
          <p>
            사용 가능 연차 <span className="font-mono tabular-nums">{availableDays}</span>일
            {startDate && (
              <>
                {' '}
                · 신청 <span className="font-mono tabular-nums">{requestedDays}</span>일
              </>
            )}
          </p>
          {missingEndDate && (
            <p className="text-destructive">종료일을 선택해 주세요</p>
          )}
          {missingStartDate && (
            <p className="text-destructive">시작일을 선택해 주세요</p>
          )}
          {exceeds && <p className="text-destructive">사용 가능 연차를 초과했습니다</p>}
          {invalidRange && <p className="text-destructive">종료일이 시작일보다 빠릅니다</p>}
          {isPast && <p className="text-destructive">과거 날짜는 신청할 수 없습니다</p>}
          {startIsNonBusiness && (
            <p className="text-destructive">
              {type === 'FULL_DAY'
                ? '시작일은 주말·공휴일로 지정할 수 없습니다'
                : '주말·공휴일에는 반차를 신청할 수 없습니다'}
            </p>
          )}
          {endIsNonBusiness && (
            <p className="text-destructive">
              종료일은 주말·공휴일로 지정할 수 없습니다
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
