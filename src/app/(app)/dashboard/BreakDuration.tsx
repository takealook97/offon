'use client';

import { useTranslation } from '@/lib/i18n/client';
import { formatDuration } from '@/lib/i18n/format';
import { useMinuteTick } from './useMinuteTick';

export function BreakDuration({ startedAt }: { startedAt: string }) {
  const { t } = useTranslation();
  const start = new Date(startedAt).getTime();
  const now = useMinuteTick();

  const elapsedMin = Math.max(0, Math.floor((now - start) / 60_000));
  return <>{t('attendance.awayFor', { duration: formatDuration(t, elapsedMin) })}</>;
}
