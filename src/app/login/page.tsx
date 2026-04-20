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
          <p className="mt-1 text-sm text-muted-foreground">Sign in with Slack</p>
        </div>
        <Card className="shadow-sm">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>
              Enter your email and a six-digit code is sent to you on Slack.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        {isDev && !slackReady && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Development: no Slack token, so the code is printed to the server console
          </p>
        )}
      </div>
    </main>
  );
}
