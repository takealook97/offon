'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function CreateMemberForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: '',
    email: '',
    slackId: '',
    position: '',
    role: 'EMPLOYEE' as 'EMPLOYEE' | 'ADMIN',
    totalDays: 15,
  });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      setMsg(null);
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.error ?? '생성 실패');
        return;
      }
      setMsg(`${form.name} 추가됨`);
      setForm({ name: '', email: '', slackId: '', position: '', role: 'EMPLOYEE', totalDays: 15 });
      router.refresh();
    });

  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <label className="space-y-1 text-sm">
      <span className="block text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type={type}
        value={String(form[key])}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            [key]: type === 'number' ? Number(e.target.value) : e.target.value,
          }))
        }
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-800"
      />
    </label>
  );

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {field('name', '이름')}
      {field('email', '이메일', 'email')}
      {field('slackId', 'Slack ID')}
      {field('position', '직책')}
      <label className="space-y-1 text-sm">
        <span className="block text-zinc-600 dark:text-zinc-400">권한</span>
        <select
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'EMPLOYEE' | 'ADMIN' }))}
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="EMPLOYEE">직원</option>
          <option value="ADMIN">관리자</option>
        </select>
      </label>
      {field('totalDays', '연차(일)', 'number')}
      <div className="md:col-span-3 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !form.name || !form.email || !form.slackId}
          onClick={submit}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? '추가 중…' : '직원 추가'}
        </button>
        {msg && <p className="text-xs text-emerald-600">{msg}</p>}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  );
}
