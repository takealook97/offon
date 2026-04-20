'use server';

import { headers } from 'next/headers';

async function postJson(path: string, body: unknown) {
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const url = `${proto}://${host}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return { status: res.status, ...data };
}

export async function requestCodeAction(email: string) {
  if (!email) return { ok: false, error: 'Please enter your email' } as const;
  const res = await postJson('/api/auth/request-code', { email });
  if (res.status === 200 && res.ok) return { ok: true } as const;
  return { ok: false, error: res.error ?? 'Request failed' } as const;
}

export async function verifyCodeAction(email: string, code: string) {
  if (!email || !code) return { ok: false, error: 'Please enter your email and the code' } as const;
  const res = await postJson('/api/auth/verify-code', { email, code });
  if (res.status === 200 && res.ok) return { ok: true } as const;
  return { ok: false, error: res.error ?? 'Could not sign in' } as const;
}
