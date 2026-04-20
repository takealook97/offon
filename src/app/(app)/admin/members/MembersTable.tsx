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
        setErr(data.error ?? 'Could not save that');
        return;
      }
      setEditing(null);
      setDraft({});
      router.refresh();
    });

  const deactivate = (id: number) =>
    start(async () => {
      if (!confirm('Deactivate this member?')) return;
      setErr(null);
      const res = await fetch('/api/admin/user/deactivate', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.error ?? 'Could not deactivate');
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
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2">Slack</th>
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2">Leave (granted/used)</th>
              <th className="px-2 py-2">Status</th>
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
                        <option value="EMPLOYEE">An employee</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    ) : m.role === 'ADMIN' ? (
                      'Admin'
                    ) : (
                      'An employee'
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
                  <td className="px-2 py-2">{m.active ? 'Active' : 'Inactive'}</td>
                  <td className="px-2 py-2 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => save(m.id)}
                          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setDraft({});
                          }}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                        >
                          Cancelled
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
                          Edit
                        </button>
                        {m.active && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => deactivate(m.id)}
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-40"
                          >
                            Deactivate
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
