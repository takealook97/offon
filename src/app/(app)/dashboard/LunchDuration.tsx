'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/client';
import { formatDuration } from '@/lib/i18n/format';
import { useMinuteTick } from './useMinuteTick';

/**
 * The badge counting through a meal. A meal's end is already fixed, so nothing has to happen
 * on the server: refreshing the screen at that moment is enough for it to return to working.
 */
export function LunchDuration({
  startedAt,
  endsAt,
}: {
  startedAt: string;
  endsAt: string;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const start = new Date(startedAt).getTime();
  const end = new Date(endsAt).getTime();
  const now = useMinuteTick();
  // A separate clock for deciding the meal has ended. An end does not fall on a minute boundary
  // — start at 12:00:37 and it ends at 13:00:37 — so a per-minute tick alone is up to a minute late.
  const [checkedAt, setCheckedAt] = useState(() => Date.now());

  useEffect(() => {
    // Once at the exact end, then keep checking. If the client clock runs ahead of the server,
    // the server still reports the meal as running after that first refresh and this component
    // stays mounted; without a retry the badge would never clear. Once the server agrees the
    // meal is over the component unmounts and the retries stop on their own.
    const id = setTimeout(() => setCheckedAt(Date.now()), Math.max(0, end - Date.now()) + 1_000);
    return () => clearTimeout(id);
  }, [end, checkedAt]);

  useEffect(() => {
    if (Math.max(now, checkedAt) >= end) router.refresh();
  }, [now, checkedAt, end, router]);

  const elapsedMin = Math.max(0, Math.floor((Math.min(now, end) - start) / 60_000));
  return <>{t('attendance.mealFor', { duration: formatDuration(t, elapsedMin) })}</>;
}
