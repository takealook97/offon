'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function LeaveActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const call = (path: string, body: Record<string, unknown>) =>
    start(async () => {
      setErr(null);
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.error ?? '처리 실패');
        return;
      }
      router.refresh();
    });

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => call('/api/leave/approve', { id })}
        className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40"
      >
        승인
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const reason = prompt('반려 사유 (선택)') ?? undefined;
          call('/api/leave/reject', { id, reason });
        }}
        className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-600 disabled:opacity-40"
      >
        반려
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
