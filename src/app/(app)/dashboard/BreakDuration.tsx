'use client';

import { useEffect, useState } from 'react';

function format(elapsedMin: number): string {
  const h = Math.floor(elapsedMin / 60);
  const m = elapsedMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m Away`;
  if (h > 0) return `${h}h Away`;
  return `${m}m Away`;
}

export function BreakDuration({ startedAt }: { startedAt: string }) {
  const start = new Date(startedAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const elapsedMin = Math.max(0, Math.floor((now - start) / 60_000));
  return <>{format(elapsedMin)}</>;
}
