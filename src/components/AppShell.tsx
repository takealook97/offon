import {
  Calendar,
  DoorOpen,
  LayoutDashboard,
  Users,
  ClipboardList,
  Settings,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LocaleToggle } from '@/components/LocaleToggle';
import { LogoutButton } from '@/components/LogoutButton';
import { MobileNav } from '@/components/MobileNav';
import { DesktopNav } from '@/components/DesktopNav';

export type NavItem = {
  href: string;
  label: string;
  iconName: 'dashboard' | 'calendar' | 'rooms' | 'users' | 'clipboard' | 'settings';
  admin?: boolean;
  /** How much is waiting to be dealt with. Anything above zero puts a red mark beside the menu item. */
  badge?: number;
};

/** Where the badge goes. A constant, so it cannot drift from the NAV entries. */
const APPROVALS_HREF = '/admin/approvals';

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', iconName: 'dashboard' },
  { href: '/calendar', label: 'Calendar', iconName: 'calendar' },
  { href: '/rooms', label: 'Rooms', iconName: 'rooms' },
  { href: '/admin/members', label: 'Members', iconName: 'users', admin: true },
  { href: APPROVALS_HREF, label: 'Approvals', iconName: 'clipboard', admin: true },
  { href: '/admin/settings', label: 'Settings', iconName: 'settings', admin: true },
];

export function iconFor(name: NavItem['iconName']) {
  switch (name) {
    case 'dashboard':
      return LayoutDashboard;
    case 'calendar':
      return Calendar;
    case 'rooms':
      return DoorOpen;
    case 'users':
      return Users;
    case 'clipboard':
      return ClipboardList;
    case 'settings':
      return Settings;
  }
}

export function AppShell({
  me,
  children,
  pendingApprovals = 0,
}: {
  me: { name: string; role: 'EMPLOYEE' | 'ADMIN' };
  children: React.ReactNode;
  /** How many approvals are waiting. Anything above zero marks the approvals menu item. */
  pendingApprovals?: number;
}) {
  const items = NAV.filter((item) => (item.admin ? me.role === 'ADMIN' : true)).map(
    (item) =>
      item.href === APPROVALS_HREF && pendingApprovals > 0
        ? { ...item, badge: pendingApprovals }
        : item,
  );

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:px-6 lg:px-8">
          <MobileNav items={items} me={me} />

          <DesktopNav items={items} />

          <div className="ml-auto flex items-center gap-1">
            <span className="hidden text-sm text-muted-foreground md:inline">
              {me.name}
              {me.role === 'ADMIN' && <span className="ml-1.5">· admin</span>}
            </span>
            <div className="hidden items-center gap-1 md:flex">
              <LocaleToggle />
              <ThemeToggle />
            </div>
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
