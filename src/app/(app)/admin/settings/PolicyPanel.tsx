'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SlidersHorizontal, UtensilsCrossed } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n/client';

type Props = {
  initial: { roomOpenMinutes: number; roomCloseMinutes: number; mealMinutes: number };
};

const MEAL_MIN = 5;
const MEAL_MAX = 240;

/** Whole hours. There is no reason to open a room on the minute, so only hours can be chosen. */
const HOURS = Array.from({ length: 25 }, (_, h) => h * 60);
/** The common break lengths. The settings API accepts others; the UI narrows it to these. */
const MEAL_CHOICES = [30, 45, 60, 90];

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function PolicyPanel({ initial }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(String(initial.roomOpenMinutes));
  const [close, setClose] = useState(String(initial.roomCloseMinutes));
  const [meal, setMeal] = useState(String(initial.mealMinutes));
  const [pending, start] = useTransition();

  const openMinutes = Number(open);
  const closeMinutes = Number(close);
  const mealMinutes = Number(meal);

  // Caught before saving. The server checks the same things, but there is no reason to let someone press the button and be refused.
  const orderError = closeMinutes <= openMinutes ? t('policy.errOrder') : null;
  const mealError =
    mealMinutes < MEAL_MIN || mealMinutes > MEAL_MAX ? t('policy.errMealRange') : null;
  const dirty =
    openMinutes !== initial.roomOpenMinutes ||
    closeMinutes !== initial.roomCloseMinutes ||
    mealMinutes !== initial.mealMinutes;

  const save = () =>
    start(async () => {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomOpenMinutes: openMinutes,
          roomCloseMinutes: closeMinutes,
          mealMinutes,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? t('settings.saveFailed'));
        return;
      }
      toast.success(t('policy.saved'));
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5" /> {t('policy.badge')}
          </CardDescription>
          <CardTitle className="text-lg">{t('policy.roomTitle')}</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('policy.roomBody')}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* The two fields stack on a narrow screen and sit side by side from sm up. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="room-open">{t('policy.roomOpen')}</Label>
              <Select value={open} onValueChange={setOpen} disabled={pending}>
                <SelectTrigger id="room-open" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.slice(0, 24).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {hhmm(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-close">{t('policy.roomClose')}</Label>
              <Select value={close} onValueChange={setClose} disabled={pending}>
                <SelectTrigger id="room-close" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.slice(1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {hhmm(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {orderError && <p className="text-xs text-destructive">{orderError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <UtensilsCrossed className="size-3.5" /> {t('policy.badge')}
          </CardDescription>
          <CardTitle className="text-lg">{t('policy.mealTitle')}</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('policy.mealBody')}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('policy.mealHint')}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 sm:max-w-[13rem]">
            <Label htmlFor="meal-minutes">{t('policy.mealTitle')}</Label>
            <Select value={meal} onValueChange={setMeal} disabled={pending}>
              <SelectTrigger id="meal-minutes" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* The stored value may not be in the list, if it was set through the API directly, so it is included. */}
                {[...new Set([...MEAL_CHOICES, initial.mealMinutes])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {t('policy.mealMinutes', { minutes: m })}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {mealError && <p className="text-xs text-destructive">{mealError}</p>}
        </CardContent>
      </Card>

      {/* Both cards save together. A button per card blurs what was actually saved. */}
      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={pending || !dirty || !!orderError || !!mealError}
          className="w-full sm:w-auto"
        >
          {pending ? t('policy.saving') : t('policy.save')}
        </Button>
      </div>
    </div>
  );
}
