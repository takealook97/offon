'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Plus, Trash2, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type Holiday = { id: number; date: string; name: string };

type Props = {
  initial: Holiday[];
};

const KO_WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function weekdayOf(dateStr: string): string {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return KO_WEEKDAY[dow] ?? '';
}

export function HolidaysPanel({ initial }: Props) {
  const [holidays, setHolidays] = useState<Holiday[]>(initial);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [adding, startAdd] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const y = h.date.slice(0, 4);
      (m.get(y) ?? m.set(y, []).get(y))!.push(h);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [holidays]);

  const canAdd = !!date && !!name.trim();

  const submit = () => {
    if (!canAdd) return;
    startAdd(async () => {
      const res = await fetch('/api/admin/holidays', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, name: name.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        holiday?: Holiday;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.holiday) {
        toast.error(data.error ?? '공휴일 추가에 실패했습니다');
        return;
      }
      setHolidays((prev) =>
        [...prev, data.holiday!].sort((a, b) => a.date.localeCompare(b.date)),
      );
      setDate('');
      setName('');
      toast.success('공휴일이 추가되었습니다');
    });
  };

  const remove = (h: Holiday) => {
    if (!confirm(`${h.date} ${h.name} 을(를) 삭제하시겠어요?`)) return;
    setDeletingId(h.id);
    fetch(`/api/admin/holidays/${h.id}`, { method: 'DELETE' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          toast.error(data.error ?? '삭제에 실패했습니다');
          return;
        }
        setHolidays((prev) => prev.filter((x) => x.id !== h.id));
        toast.success('공휴일이 삭제되었습니다');
      })
      .finally(() => setDeletingId(null));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" /> 공휴일
        </CardDescription>
        <CardTitle className="text-lg">공휴일 관리</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          등록된 공휴일은 주말과 동일하게 처리됩니다. 연차 신청 시 일수에서 제외되며,
          해당 일자로의 반차 신청은 불가합니다. 연차 <b>승인 시점</b>에 현재 공휴일
          목록으로 일수를 다시 계산하므로, 신청 후 공휴일을 추가해도 승인에 반영됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="holiday-date">날짜</Label>
            <Input
              id="holiday-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-name">명칭</Label>
            <Input
              id="holiday-name"
              type="text"
              placeholder="예) 어린이날"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              maxLength={100}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={submit}
              disabled={!canAdd || adding}
              className="h-10 w-full sm:w-auto"
            >
              {adding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" /> 추가
                </>
              )}
            </Button>
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
            등록된 공휴일이 없습니다
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map(([year, items]) => (
              <div key={year} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {year}년 · {items.length}건
                </h3>
                <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                  {items.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="font-mono tabular-nums">{h.date}</span>
                        <span className="text-muted-foreground">
                          ({weekdayOf(h.date)})
                        </span>
                        <span className="truncate">{h.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(h)}
                        disabled={deletingId === h.id}
                        aria-label={`${h.name} 삭제`}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {deletingId === h.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
