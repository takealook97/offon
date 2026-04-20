'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Mail, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const [cooldown, setCooldown] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const request = (resend = false) =>
    start(async () => {
      const res = await postJson('/api/auth/request-code', { email });
      if (!res.ok) {
        toast.error(res.error ?? 'Request failed');
        return;
      }
      if (!resend) setStep('code');
      setCooldown(30);
      toast.success('Code sent to your Slack DM');
    });

  const verify = () =>
    start(async () => {
      const res = await postJson('/api/auth/verify-code', { email, code });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not sign in');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    });

  if (step === 'email') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (email) request(false);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-11 pl-9"
              suppressHydrationWarning
            />
          </div>
        </div>
        <Button type="submit" disabled={pending || !email} className="h-11 w-full">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <>Send me a code <ArrowRight className="size-4" /></>}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) verify();
      }}
    >
      <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Sent to</span>
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <span className="truncate font-medium">{email}</span>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setCode('');
            }}
            className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Now
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">Verification code</Label>
        <Input
          id="code"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          autoComplete="one-time-code"
          autoFocus
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="h-14 text-center font-mono text-2xl tracking-[0.6em] caret-transparent"
        />
      </div>
      <Button type="submit" disabled={pending || code.length !== 6} className="h-11 w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : 'Sign in'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending || cooldown > 0}
        onClick={() => request(true)}
        className="w-full gap-2 text-muted-foreground"
      >
        <RotateCcw className="size-3.5" />
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the code'}
      </Button>
    </form>
  );
}
