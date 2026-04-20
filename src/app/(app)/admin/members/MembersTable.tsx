'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export type MemberRow = {
  id: number;
  name: string;
  email: string | null;
  slackId: string;
  position: string | null;
  role: 'EMPLOYEE' | 'ADMIN';
  active: boolean;
  totalDays: number;
  usedDays: number;
};

export function MembersTable({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<MemberRow>>({});
  const [err, setErr] = useState<string | null>(null);

  const save = (id: number) =>
    start(async () => {
      setErr(null);
      const res = await fetch('/api/admin/user', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.error ?? '저장 실패');
        return;
      }
      setEditing(null);
      setDraft({});
      router.refresh();
    });

  const deactivate = (id: number) =>
    start(async () => {
      if (!confirm('해당 직원을 비활성화하시겠습니까?')) return;
      setErr(null);
      const res = await fetch('/api/admin/user/deactivate', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.error ?? '비활성화 실패');
        return;
      }
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500 dark:border-zinc-800">
              <th className="px-2 py-2">이름</th>
              <th className="px-2 py-2">이메일</th>
              <th className="px-2 py-2">Slack</th>
              <th className="px-2 py-2">직책</th>
              <th className="px-2 py-2">권한</th>
              <th className="px-2 py-2">연차(부여/사용)</th>
              <th className="px-2 py-2">상태</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isEditing = editing === m.id;
              const v = { ...m, ...draft };
              return (
                <tr key={m.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-2">
                    {isEditing ? (
                      <input
                        value={v.name ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        className="rounded border border-zinc-300 px-1 dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    ) : (
                      m.name
                    )}
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-500">{m.email}</td>
                  <td className="px-2 py-2 font-mono text-xs">
                    {isEditing ? (
                      <input
                        value={v.slackId ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, slackId: e.target.value }))}
                        className="rounded border border-zinc-300 px-1 dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    ) : (
                      m.slackId
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {isEditing ? (
                      <input
                        value={v.position ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, position: e.target.value }))}
                        className="rounded border border-zinc-300 px-1 dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    ) : (
                      m.position ?? '—'
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {isEditing ? (
                      <select
                        value={v.role}
                        onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as 'EMPLOYEE' | 'ADMIN' }))}
                        className="rounded border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <option value="EMPLOYEE">직원</option>
                        <option value="ADMIN">관리자</option>
                      </select>
                    ) : m.role === 'ADMIN' ? (
                      '관리자'
                    ) : (
                      '직원'
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {isEditing ? (
                      <input
                        type="number"
                        value={v.totalDays ?? 0}
                        onChange={(e) => setDraft((d) => ({ ...d, totalDays: Number(e.target.value) }))}
                        className="w-16 rounded border border-zinc-300 px-1 dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    ) : (
                      `${m.totalDays} / ${m.usedDays}`
                    )}
                  </td>
                  <td className="px-2 py-2">{m.active ? '활성' : '비활성'}</td>
                  <td className="px-2 py-2 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => save(m.id)}
                          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setDraft({});
                          }}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(m.id);
                            setDraft({
                              name: m.name,
                              slackId: m.slackId,
                              position: m.position,
                              role: m.role,
                              totalDays: m.totalDays,
                            });
                          }}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                        >
                          수정
                        </button>
                        {m.active && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => deactivate(m.id)}
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-40"
                          >
                            비활성화
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
