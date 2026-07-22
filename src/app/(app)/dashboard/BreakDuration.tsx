'use client';

import { useMinuteTick } from './useMinuteTick';

function format(elapsedMin: number): string {
  const h = Math.floor(elapsedMin / 60);
  const m = elapsedMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m Away`;
  if (h > 0) return `${h}h Away`;
  return `${m}m Away`;
}

export function BreakDuration({ startedAt }: { startedAt: string }) {
  const start = new Date(startedAt).getTime();
  const now = useMinuteTick();

  const elapsedMin = Math.max(0, Math.floor((now - start) / 60_000));
  return <>{format(elapsedMin)}</>;
}
