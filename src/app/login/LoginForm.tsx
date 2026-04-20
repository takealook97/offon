'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';

async function postJson(path: string, body: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return { status: res.status, ok: !!data.ok, error: data.error };
}

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const onRequest = () => {
    setError(null);
    start(async () => {
      const res = await postJson('/api/auth/request-code', { email });
      if (!res.ok) {
        setError(res.error ?? '요청 실패');
        return;
      }
      setStep('code');
      setCooldown(30);
    });
  };

  const onResend = () => {
    if (cooldown > 0) return;
    setError(null);
    start(async () => {
      const res = await postJson('/api/auth/request-code', { email });
      if (!res.ok) {
        setError(res.error ?? '요청 실패');
        return;
      }
      setCooldown(30);
    });
  };

  const onVerify = () => {
    setError(null);
    start(async () => {
      const res = await postJson('/api/auth/verify-code', { email, code });
      if (!res.ok) {
        setError(res.error ?? '로그인 실패');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium">이메일</span>
        <input
          type="email"
          value={email}
          autoComplete="email"
          disabled={step === 'code'}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:disabled:bg-zinc-900"
          placeholder="you@company.com"
        />
      </label>

      {step === 'code' && (
        <label className="block space-y-2">
          <span className="text-sm font-medium">인증 코드 (6자리)</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-widest dark:border-zinc-700 dark:bg-zinc-800"
            placeholder="000000"
          />
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {step === 'email' ? (
        <button
          type="button"
          disabled={pending || !email}
          onClick={onRequest}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? '전송 중…' : '인증 코드 받기'}
        </button>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            disabled={pending || code.length !== 6}
            onClick={onVerify}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? '확인 중…' : '로그인'}
          </button>
          <button
            type="button"
            disabled={pending || cooldown > 0}
            onClick={onResend}
            className="w-full text-sm text-zinc-500 underline underline-offset-2 disabled:opacity-40"
          >
            {cooldown > 0 ? `재전송 ${cooldown}초 후` : '코드 재전송'}
          </button>
        </div>
      )}
    </div>
  );
}
