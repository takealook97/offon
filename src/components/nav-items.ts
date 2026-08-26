import {
  Calendar,
  ClipboardList,
  DoorOpen,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import type { MessageKey } from '@/lib/i18n/dictionary';

/**
 * The navigation definitions. They live here rather than in AppShell because AppShell is a
 * server component and imports a translator that uses `next/headers`. When MobileNav and
 * DesktopNav, both client components, pulled these from AppShell, a server-only module was
 * dragged into the client bundle and the build broke. This file has no server dependencies.
 */
export type NavItem = {
  href: string;
  labelKey: MessageKey;
  iconName: 'dashboard' | 'calendar' | 'rooms' | 'users' | 'clipboard' | 'settings';
  admin?: boolean;
  /** How much is waiting to be dealt with. Anything above zero puts a red mark beside the menu item. */
  badge?: number;
};

/** Where the badge goes. A constant, so it cannot drift from the NAV entries. */
export const APPROVALS_HREF = '/admin/approvals';

export const NAV: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', iconName: 'dashboard' },
  { href: '/calendar', labelKey: 'nav.calendar', iconName: 'calendar' },
  { href: '/rooms', labelKey: 'nav.rooms', iconName: 'rooms' },
  { href: '/admin/members', labelKey: 'nav.members', iconName: 'users', admin: true },
  { href: APPROVALS_HREF, labelKey: 'nav.approvals', iconName: 'clipboard', admin: true },
  { href: '/admin/settings', labelKey: 'nav.settings', iconName: 'settings', admin: true },
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
