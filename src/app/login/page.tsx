import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">offon 로그인</h1>
          <p className="text-sm text-zinc-500">Slack DM으로 받은 6자리 코드를 입력합니다</p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
