'use client';

import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n/client';

/**
 * The red dot saying something is waiting to be dealt with.
 *
 * It sits in the flow rather than on top of the label, and its parent makes room for it.
 * The red matches the one the calendar uses for a missing record.
 * The pulse is wrapped in motion-safe, so on a device set to reduce motion the dot simply
 * sits there.
 */
export function NavBadge({ count, className }: { count: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn('relative flex size-1.5 shrink-0', className)}
      role="status"
      aria-label={t('nav.pendingBadge', { count })}
    >
      <span className="absolute inline-flex size-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
      <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
    </span>
  );
}
