'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { requestCodeAction, verifyCodeAction } from './actions';

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
      const res = await requestCodeAction(email);
      if (!res.ok) {
        setError(res.error);
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
      const res = await requestCodeAction(email);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCooldown(30);
    });
  };

  const onVerify = () => {
    setError(null);
    start(async () => {
      const res = await verifyCodeAction(email, code);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium">Email</span>
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
          <span className="text-sm font-medium">Code (six digits)</span>
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
          {pending ? 'Sending…' : 'Send me a code'}
        </button>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            disabled={pending || code.length !== 6}
            onClick={onVerify}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? 'Checking…' : 'Sign in'}
          </button>
          <button
            type="button"
            disabled={pending || cooldown > 0}
            onClick={onResend}
            className="w-full text-sm text-zinc-500 underline underline-offset-2 disabled:opacity-40"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the code'}
          </button>
        </div>
      )}
    </div>
  );
}
