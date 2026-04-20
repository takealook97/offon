'use client';

import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';

export function AttendanceActions({
  hasClockIn,
  hasClockOut,
}: {
  hasClockIn: boolean;
  hasClockOut: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const call = (path: string) =>
    start(async () => {
      setErr(null);
      const res = await fetch(path, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.error ?? 'Request failed');
        return;
      }
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || hasClockIn}
          onClick={() => call('/api/attendance/clock-in')}
          className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Clock in
        </button>
        <button
          type="button"
          disabled={pending || !hasClockIn || hasClockOut}
          onClick={() => call('/api/attendance/clock-out')}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700"
        >
          Clock out
        </button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
