'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { NavBadge } from '@/components/NavBadge';
import type { NavItem } from '@/components/AppShell';
import { useTranslation } from '@/lib/i18n/client';

export function DesktopNav({ items }: { items: NavItem[] }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {items.map(({ href, labelKey, badge }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            // inline-flex puts the dot beside the label rather than over it, so nothing is obscured.
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
            isActive(href)
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          {t(labelKey)}
          {badge ? <NavBadge count={badge} /> : null}
        </Link>
      ))}
    </nav>
  );
}
