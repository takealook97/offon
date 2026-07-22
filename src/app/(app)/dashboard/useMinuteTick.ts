'use client';

import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/**
 * Updates the current time at the moment the minute changes.
 *
 * A fixed interval starts wherever the timer happens to, so the display lags the minute boundary
 * The reading should change on the minute but flips twenty seconds late.
 * So only the first timer waits out the remainder of the minute, and it runs on a 60-second interval after that.
 *
 * A hidden tab has its timers throttled or coalesced, which pulls the alignment off again,
 * so it is re-established every time the tab becomes visible.
 */
export function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    const clear = () => {
      if (timeout) clearTimeout(timeout);
      if (interval) clearInterval(interval);
      timeout = null;
      interval = null;
    };

    const align = () => {
      clear();
      setNow(Date.now());
      // The epoch starts on a whole minute and offsets are whole minutes, so the remainder is the distance to the next.
      timeout = setTimeout(() => {
        setNow(Date.now());
        interval = setInterval(() => setNow(Date.now()), MINUTE_MS);
      }, MINUTE_MS - (Date.now() % MINUTE_MS));
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') align();
    };

    align();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clear();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return now;
}
