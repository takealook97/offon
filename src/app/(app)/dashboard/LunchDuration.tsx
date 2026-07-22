'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

function format(elapsedMin: number): string {
  const h = Math.floor(elapsedMin / 60);
  const m = elapsedMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m On meal`;
  if (h > 0) return `${h}h On meal`;
  return `${m}m On meal`;
}

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
  const start = new Date(startedAt).getTime();
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Once the end has passed, a refresh clears the meal badge on its own.
    // Checked on every tick because if the client clock runs ahead, a one-shot refresh fires and
    // the server still reports the meal as running, this component stays mounted, and there is no second chance to clear it.
    // Once the server agrees the meal is over the component unmounts and the loop stops on its own.
    const tick = () => {
      setNow(Date.now());
      if (Date.now() >= end) router.refresh();
    };
    const id = setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    const endId = setTimeout(tick, Math.max(0, end - Date.now()) + 1_000);
    return () => {
      clearInterval(id);
      clearTimeout(endId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [end, router]);

  const elapsedMin = Math.max(0, Math.floor((Math.min(now, end) - start) / 60_000));
  return <>{format(elapsedMin)}</>;
}
