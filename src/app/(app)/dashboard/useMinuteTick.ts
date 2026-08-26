'use client';

import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/**
 * Updates the current time at the moment the minute changes.
 *
 * A fixed interval starts wherever the timer happens to start, so the display lags the minute
 * boundary by up to that interval: the reading should change at 12:13:00 but flips at 12:13:20.
 * So only the first timer waits out the remainder of the current minute, and it runs on a
 * 60-second interval after that.
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
      // The epoch starts on a whole minute and timezone offsets are whole minutes, so the
      // remainder is exactly the distance to the next minute boundary.
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
