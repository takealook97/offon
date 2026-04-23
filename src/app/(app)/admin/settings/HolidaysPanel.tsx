'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
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

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());

  const yearItems = useMemo(
    () =>
      holidays
        .filter((h) => h.date.startsWith(`${viewYear}-`))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [holidays, viewYear],
  );

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
        toast.error(data.error ?? 'Could not add that holiday');
        return;
      }
      const added = data.holiday!;
      setHolidays((prev) =>
        [...prev, added].sort((a, b) => a.date.localeCompare(b.date)),
      );
      setViewYear(Number(added.date.slice(0, 4)));
      setDate('');
      setName('');
      toast.success('Holiday added');
    });
  };

  const remove = (h: Holiday) => {
    if (!confirm(`Delete ${h.date} ${h.name}?`)) return;
    setDeletingId(h.id);
    fetch(`/api/admin/holidays/${h.id}`, { method: 'DELETE' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          toast.error(data.error ?? 'Could not delete that');
          return;
        }
        setHolidays((prev) => prev.filter((x) => x.id !== h.id));
        toast.success('Holiday deleted');
      })
      .finally(() => setDeletingId(null));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" /> Holidays
        </CardDescription>
        <CardTitle className="text-lg">Public holidays</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          A holiday is treated exactly as a weekend is. It drops out of the day count,
          Neither leave nor a half day can be requested on that date. At <b>approval</b>, the days are recounted
          against the holidays as they stand, so one added after the request still counts.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="holiday-date">Date</Label>
            <Input
              id="holiday-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-name">Name</Label>
            <Input
              id="holiday-name"
              type="text"
              placeholder="e.g. New Year's Day"
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
                  <Plus className="size-4" /> Add
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewYear((y) => y - 1)}
                aria-label="Previous year"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
              <h3 className="min-w-[4.5rem] text-center text-sm font-semibold">
                {viewYear}
              </h3>
              <button
                type="button"
                onClick={() => setViewYear((y) => y + 1)}
                aria-label="Next year"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {yearItems.length}
            </span>
          </div>
          {yearItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
              No holidays have been added for {viewYear}
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-md border border-border/60">
              {yearItems.map((h) => (
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
                    aria-label={`${h.name} Remove`}
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
