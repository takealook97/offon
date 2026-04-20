'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoutButton } from '@/components/LogoutButton';
import { cn } from '@/lib/cn';
import { iconFor, type NavItem } from '@/components/AppShell';

export function MobileNav({
  items,
  me,
}: {
  items: NavItem[];
  me: { name: string; role: 'EMPLOYEE' | 'ADMIN' };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="메뉴 열기">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b border-border/60 px-6 py-4">
          <SheetTitle className="text-left">
            <span className="flex items-center gap-2">
              <Image src="/logo.png" alt="" width={28} height={28} className="rounded-md" priority />
              <span className="text-lg font-semibold tracking-tight">offon</span>
            </span>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col p-3">
          {items.map((item) => {
            const Icon = iconFor(item.iconName);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Separator />
        <div className="flex flex-col gap-1 p-3">
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <div className="flex flex-col">
              <span className="font-medium">{me.name}</span>
              <span className="text-xs text-muted-foreground">
                {me.role === 'ADMIN' ? '관리자' : '직원'}
              </span>
            </div>
            <ThemeToggle />
          </div>
          <LogoutButton className="justify-start" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
