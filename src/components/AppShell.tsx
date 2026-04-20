'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Calendar, LayoutDashboard, Menu, Users, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoutButton } from '@/components/LogoutButton';
import { cn } from '@/lib/cn';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  admin?: boolean;
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/admin/members', label: 'Members', icon: Users, admin: true },
  { href: '/admin/leaves', label: 'Leave Approve', icon: ClipboardList, admin: true },
];

export function AppShell({
  me,
  children,
}: {
  me: { name: string; role: 'EMPLOYEE' | 'ADMIN' };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = NAV.filter((item) => (item.admin ? me.role === 'ADMIN' : true));

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:px-6 lg:px-8">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b border-border/60 px-6 py-4">
                <SheetTitle className="text-left">
                  <span className="text-lg font-semibold tracking-tight">offon</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col p-3">
                {items.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                      isActive(href)
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                ))}
              </nav>
              <Separator />
              <div className="flex flex-col gap-1 p-3">
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{me.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {me.role === 'ADMIN' ? 'Admin' : 'An employee'}
                    </span>
                  </div>
                  <ThemeToggle />
                </div>
                <LogoutButton className="justify-start" />
              </div>
            </SheetContent>
          </Sheet>

          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            offon
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {items.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  isActive(href)
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <span className="hidden text-sm text-muted-foreground md:inline">
              {me.name}
              {me.role === 'ADMIN' && <span className="ml-1.5 text-xs">· admin</span>}
            </span>
            <ThemeToggle />
            <div className="hidden md:block">
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
