import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { LocaleProvider } from '@/lib/i18n/client';
import { getLocale } from '@/lib/i18n/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'offon · attendance for Slack teams',
  description:
    'Self-hosted attendance and leave management, driven from Slack. Clock in with a slash command, request leave from the web app.',
  keywords: ['offon', 'attendance', 'leave', 'slack', 'time tracking', 'self-hosted'],
  appleWebApp: {
    capable: true,
    title: 'offon',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read from the cookie once and passed down the whole tree. A client reading it separately would break hydration.
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-svh flex flex-col" suppressHydrationWarning>
        <LocaleProvider locale={locale}>
          <ThemeProvider>
            {children}
            <Toaster position="top-right" richColors closeButton />
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
