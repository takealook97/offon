'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type LeaveType = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

export function LeaveRequestForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState<LeaveType>('FULL_DAY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      setMsg(null);
      const body = {
        type,
        startDate,
        endDate: type === 'FULL_DAY' ? endDate || startDate : startDate,
        reason: reason || undefined,
      };
      const res = await fetch('/api/leave/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.error ?? '요청 실패');
        return;
      }
      setMsg('신청되었습니다');
      setStartDate('');
      setEndDate('');
      setReason('');
      router.refresh();
    });

  return (
    <div className="grid gap-3 text-sm md:grid-cols-4">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as LeaveType)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-800"
      >
        <option value="FULL_DAY">종일</option>
        <option value="HALF_DAY_AM">오전 반차</option>
        <option value="HALF_DAY_PM">오후 반차</option>
      </select>
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-800"
      />
      {type === 'FULL_DAY' && (
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-800"
        />
      )}
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="사유 (선택)"
        className="rounded-md border border-zinc-300 bg-white px-2 py-2 md:col-span-2 dark:border-zinc-700 dark:bg-zinc-800"
      />
      <div className="md:col-span-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !startDate}
          onClick={submit}
          className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? '처리 중…' : '연차 신청'}
        </button>
        {msg && <p className="text-xs text-emerald-600">{msg}</p>}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  );
}
