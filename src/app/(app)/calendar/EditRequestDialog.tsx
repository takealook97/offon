'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Matcher } from 'react-day-picker';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslation } from '@/lib/i18n/client';
import { translateFailure } from '@/lib/i18n/format';
import type { MessageKey } from '@/lib/i18n/dictionary';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LUNCH_MINUTES,
  buildAndValidateTimeline,
  type EditableSession,
} from '@/lib/attendance-edit';

type BreakDraft = { start: string; end: string }; // 'yyyy-MM-ddTHH:mm'

type Item = [value: string, label: string];

/** The hour and minute labels are language-dependent, so these cannot be module constants. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
const hourItems = (t: Translate): Item[] =>
  Array.from({ length: 24 }, (_, i) => [String(i).padStart(2, '0'), t('edit.hour', { h: i })]);
const minuteItems = (t: Translate): Item[] =>
  Array.from({ length: 60 }, (_, i) => [String(i).padStart(2, '0'), t('edit.minute', { m: i })]);

const pad = (n: number) => String(n).padStart(2, '0');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const earlier = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);
function toWall(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function wallToLocalDate(v: string): Date {
  return new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
}
function wallToLocal(v: string): Date {
  return new Date(
    Number(v.slice(0, 4)),
    Number(v.slice(5, 7)) - 1,
    Number(v.slice(8, 10)),
    Number(v.slice(11, 13)),
    Number(v.slice(14, 16)),
  );
}
/** A meal always ends at its start plus the fixed length. It cannot be set directly, only moved. */
function lunchEndWall(startWall: string): string {
  return toWall(new Date(wallToLocal(startWall).getTime() + LUNCH_MINUTES * 60_000));
}

function atTime(v: string, h: number, m: number): Date {
  return new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)), h, m);
}

function TimeSel({
  value,
  onValueChange,
  items,
  isDisabled,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: Item[];
  isDisabled?: (v: string) => boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 w-[76px] shrink-0 px-2.5">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {items.map(([v, label]) => (
          <SelectItem key={v} value={v} disabled={isDisabled?.(v)}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DateTimePicker({
  value,
  onChange,
  minDate,
  maxDate,
  min,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  minDate?: Date;
  maxDate?: Date;
  min?: Date;
  max?: Date;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selectedDate = wallToLocalDate(value);
  const h = value.slice(11, 13);
  const mi = value.slice(14, 16);
  const hNum = Number(h);

  const setDate = (d?: Date) => {
    if (!d) return;
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${h}:${mi}`);
    setOpen(false);
  };

  const calDisabled: Matcher[] = [];
  if (minDate) calDisabled.push({ before: minDate });
  if (maxDate) calDisabled.push({ after: maxDate });

  const hourDisabled = (hv: string) => {
    const lo = atTime(value, Number(hv), 0);
    const hi = atTime(value, Number(hv), 59);
    if (min && hi.getTime() < min.getTime()) return true;
    if (max && lo.getTime() > max.getTime()) return true;
    return false;
  };
  const minuteDisabled = (mv: string) => {
    const t = atTime(value, hNum, Number(mv));
    if (min && t.getTime() < min.getTime()) return true;
    if (max && t.getTime() > max.getTime()) return true;
    return false;
  };

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 min-w-0 flex-1 shrink justify-start gap-2 px-3 font-normal"
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">
              {format(selectedDate, 'MM-dd (EEE)', { locale: ko })}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setDate}
            defaultMonth={selectedDate}
            disabled={calDisabled.length ? calDisabled : undefined}
            required
          />
        </PopoverContent>
      </Popover>
      <TimeSel
        value={h}
        onValueChange={(v) => onChange(`${value.slice(0, 10)}T${v}:${mi}`)}
        items={hourItems(t)}
        isDisabled={hourDisabled}
      />
      <span className="text-sm text-muted-foreground">:</span>
      <TimeSel
        value={mi}
        onValueChange={(v) => onChange(`${value.slice(0, 10)}T${h}:${v}`)}
        items={minuteItems(t)}
        isDisabled={minuteDisabled}
      />
    </div>
  );
}

export function EditRequestDialog({
  session,
  open,
  onOpenChange,
  onDone,
}: {
  session: EditableSession;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const [pending, start] = useTransition();
  const [clockIn, setClockIn] = useState(session.clockIn);
  const [clockOut, setClockOut] = useState<string | null>(session.clockOut);
  // Breaks and meals follow different editing rules — a meal's end is fixed — so their state is kept apart.
  const initialBreaks = session.breaks.filter((b) => b.kind !== 'LUNCH');
  const initialLunches = session.breaks.filter((b) => b.kind === 'LUNCH').map((b) => b.start);
  const [breaks, setBreaks] = useState<BreakDraft[]>(
    initialBreaks.map(({ start: s, end }) => ({ start: s, end })),
  );
  const [lunches, setLunches] = useState<string[]>(initialLunches);

  const addBreak = () =>
    setBreaks((prev) => [...prev, { start: clockIn, end: clockOut ?? toWall(new Date()) }]);
  const removeBreak = (i: number) => setBreaks((prev) => prev.filter((_, idx) => idx !== i));
  const updateBreak = (i: number, patch: Partial<BreakDraft>) =>
    setBreaks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  // The whole meal has to fit inside the working span, the same rule the server applies.
  // So the latest it can start is the clock-out less its length, and if that falls before the clock-in there is no room.
  const lunchStartMax = () => {
    const co = clockOut ? wallToLocal(clockOut) : null;
    return co ? new Date(co.getTime() - LUNCH_MINUTES * 60_000) : new Date();
  };
  const canAddLunch = wallToLocal(clockIn).getTime() <= lunchStartMax().getTime();
  const addLunch = () => setLunches((prev) => [...prev, clockIn]);
  const removeLunch = (i: number) => setLunches((prev) => prev.filter((_, idx) => idx !== i));
  const updateLunch = (i: number, v: string) =>
    setLunches((prev) => prev.map((s, idx) => (idx === i ? v : s)));

  const submit = () => {
    const unchanged =
      clockIn === session.clockIn &&
      clockOut === session.clockOut &&
      JSON.stringify(breaks) === JSON.stringify(initialBreaks.map(({ start: s, end }) => ({ start: s, end }))) &&
      JSON.stringify(lunches) === JSON.stringify(initialLunches);
    if (unchanged) {
      toast.error(t('edit.noChanges'));
      return;
    }
    const payload = {
      clockIn,
      clockOut,
      breaks: [
        ...breaks.map((b) => ({ ...b, kind: 'BREAK' as const })),
        ...lunches.map((s) => ({
          start: s,
          end: lunchEndWall(s),
          kind: 'LUNCH' as const,
        })),
      ],
    };
    const check = buildAndValidateTimeline(payload);
    if (!check.ok) {
      toast.error(translateFailure(t, check));
      return;
    }
    start(async () => {
      const res = await fetch('/api/attendance/edit/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, ...payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? t('edit.failed'));
        return;
      }
      toast.success(t('edit.sent'));
      onOpenChange(false);
      onDone?.();
    });
  };

  // Works out the allowed ranges: nothing in the future, the clock-in pinned to the work date, the clock-out no earlier, and breaks inside the working span.
  const now = new Date();
  const nowDay = startOfDay(now);
  const ci = wallToLocal(clockIn);
  const co = clockOut ? wallToLocal(clockOut) : null;
  const workDate = wallToLocalDate(session.clockIn);
  const breakUpper = co ? earlier(now, co) : now;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[85svh] overflow-x-hidden overflow-y-auto p-4 sm:max-w-lg sm:p-6"
      >
        <DialogHeader>
          <DialogTitle>{t('edit.title')}</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label>{t('edit.clockIn')}</Label>
            <DateTimePicker
              value={clockIn}
              onChange={setClockIn}
              minDate={workDate}
              maxDate={workDate}
              min={startOfDay(workDate)}
              max={breakUpper}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('edit.clockOut')}</Label>
            {clockOut !== null ? (
              <DateTimePicker
                value={clockOut}
                onChange={setClockOut}
                minDate={startOfDay(ci)}
                maxDate={nowDay}
                min={ci}
                max={now}
              />
            ) : (
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {t('edit.inProgress')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('edit.meal')}</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={addLunch}
                disabled={!canAddLunch}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="size-3.5" />
                {t('edit.add')}
              </Button>
            </div>
            {lunches.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {canAddLunch
                  ? t('edit.noMeal')
                  : t('edit.tooShortForMeal', { minutes: LUNCH_MINUTES })}
              </p>
            ) : (
              <div className="space-y-2">
                {lunches.map((s, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('edit.mealN', { n: i + 1 })}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLunch(i)}
                        className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                        {t('edit.delete')}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t('edit.start')}</Label>
                      <DateTimePicker
                        value={s}
                        onChange={(v) => updateLunch(i, v)}
                        minDate={startOfDay(ci)}
                        maxDate={startOfDay(lunchStartMax())}
                        min={ci}
                        max={lunchStartMax()}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('edit.mealEndFixed', { time: lunchEndWall(s).slice(11), minutes: LUNCH_MINUTES })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('edit.away')}</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={addBreak}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="size-3.5" />
                {t('edit.add')}
              </Button>
            </div>
            {breaks.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('edit.noAway')}</p>
            ) : (
              <div className="space-y-2">
                {breaks.map((b, i) => {
                  const bs = wallToLocal(b.start);
                  const be = wallToLocal(b.end);
                  return (
                    <div key={i} className="space-y-2 rounded-lg border border-border/60 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('edit.awayN', { n: i + 1 })}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeBreak(i)}
                          className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                          {t('edit.delete')}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('edit.start')}</Label>
                          <DateTimePicker
                            value={b.start}
                            onChange={(v) => updateBreak(i, { start: v })}
                            minDate={startOfDay(ci)}
                            maxDate={startOfDay(breakUpper)}
                            min={ci}
                            max={earlier(breakUpper, be)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('edit.end')}</Label>
                          <DateTimePicker
                            value={b.end}
                            onChange={(v) => updateBreak(i, { end: v })}
                            minDate={startOfDay(bs)}
                            maxDate={startOfDay(breakUpper)}
                            min={bs}
                            max={breakUpper}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? t('edit.submitting') : t('edit.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
