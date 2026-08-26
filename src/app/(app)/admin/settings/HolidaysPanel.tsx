'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslation } from '@/lib/i18n/client';

type Holiday = { id: number; date: string; name: string };

type Props = {
  initial: Holiday[];
};



/** A calendar date's weekday does not depend on a timezone, so it is read at midnight UTC. */
function weekdayOf(dateStr: string, weekdays: string[]): string {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return weekdays[dow] ?? '';
}

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s: string): Date | undefined =>
  s
    ? new Date(
        Number(s.slice(0, 4)),
        Number(s.slice(5, 7)) - 1,
        Number(s.slice(8, 10)),
      )
    : undefined;

export function HolidaysPanel({ initial }: Props) {
  const { t } = useTranslation();
  const weekdays = t('weekday.short').split(',');
  const [holidays, setHolidays] = useState<Holiday[]>(initial);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [adding, startAdd] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [pickerOpen, setPickerOpen] = useState(false);

  const existingDates = useMemo(
    () => new Set(holidays.map((h) => h.date)),
    [holidays],
  );
  const selectedDate = fromYmd(date);

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
        toast.error(data.error ?? t('holiday.addFailed'));
        return;
      }
      const added = data.holiday!;
      setHolidays((prev) =>
        [...prev, added].sort((a, b) => a.date.localeCompare(b.date)),
      );
      setViewYear(Number(added.date.slice(0, 4)));
      setDate('');
      setName('');
      toast.success(t('holiday.added'));
    });
  };

  const remove = (h: Holiday) => {
    if (!confirm(t('holiday.deleteConfirm', { date: h.date, name: h.name }))) return;
    setDeletingId(h.id);
    fetch(`/api/admin/holidays/${h.id}`, { method: 'DELETE' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          toast.error(data.error ?? t('holiday.deleteFailed'));
          return;
        }
        setHolidays((prev) => prev.filter((x) => x.id !== h.id));
        toast.success(t('holiday.deleted'));
      })
      .finally(() => setDeletingId(null));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" /> {t('holiday.badge')}
        </CardDescription>
        <CardTitle className="text-lg">{t('holiday.title')}</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('holiday.description')}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="holiday-date">{t('holiday.date')}</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="holiday-date"
                  type="button"
                  variant="outline"
                  className="h-10 w-full min-w-0 justify-start gap-2 px-3 font-normal"
                >
                  <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                  {selectedDate ? (
                    <span className="truncate">
                      {format(selectedDate, 'yyyy-MM-dd (EEE)', { locale: ko })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t('holiday.pickDate')}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    if (!d) return;
                    setDate(toYmd(d));
                    setPickerOpen(false);
                  }}
                  defaultMonth={selectedDate}
                  disabled={(d) => existingDates.has(toYmd(d))}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-name">{t('holiday.name')}</Label>
            <Input
              id="holiday-name"
              type="text"
              placeholder={t('holiday.namePlaceholder')}
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
                  <Plus className="size-4" /> {t('holiday.add')}
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
                aria-label={t('holiday.prevYear')}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
              <h3 className="min-w-[4.5rem] text-center text-sm font-semibold">
                {t('holiday.year', { year: viewYear })}
              </h3>
              <button
                type="button"
                onClick={() => setViewYear((y) => y + 1)}
                aria-label={t('holiday.nextYear')}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {t('holiday.count', { count: yearItems.length })}
            </span>
          </div>
          {yearItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
              {t('holiday.emptyYear', { year: viewYear })}
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
                      ({weekdayOf(h.date, weekdays)})
                    </span>
                    <span className="truncate">{h.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(h)}
                    disabled={deletingId === h.id}
                    aria-label={t('holiday.deleteLabel', { name: h.name })}
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
