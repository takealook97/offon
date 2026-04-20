import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  const isDev = process.env.NODE_ENV !== 'production';
  const slackReady =
    !!process.env.SLACK_BOT_TOKEN && !process.env.SLACK_BOT_TOKEN.includes('replace-me');

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="offon" width={72} height={72} className="rounded-2xl" priority />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">offon</h1>
          <p className="mt-1 text-sm text-muted-foreground">Slack으로 로그인합니다</p>
        </div>
        <Card className="shadow-sm">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-lg">로그인</CardTitle>
            <CardDescription>
              이메일을 입력하면 Slack DM으로 6자리 인증 코드가 발송됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        {isDev && !slackReady && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            dev 모드: Slack 토큰 미설정 — 서버 콘솔에 OTP가 출력됩니다
          </p>
        )}
      </div>
    </main>
  );
}
