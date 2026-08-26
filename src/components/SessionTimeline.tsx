'use client';

import { formatZoned } from '@/lib/time';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n/client';
import { formatDuration } from '@/lib/i18n/format';

type Session = { startAt: Date; endAt: Date | null };

export function SessionTimeline({
  sessions,
  now = new Date(),
}: {
  sessions: Session[];
  now?: Date;
}) {
  const { t } = useTranslation();
  if (sessions.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
      <span className="w-full text-xs font-medium text-muted-foreground">{t('timeline.title')}</span>
      {sessions.map((s, i) => (
        <SessionChip key={i} session={s} now={now} />
      ))}
    </div>
  );
}

function SessionChip({ session, now }: { session: Session; now: Date }) {
  const { t } = useTranslation();
  const ongoing = !session.endAt;
  const endAt = session.endAt ?? now;
  const minutes = Math.max(
    0,
    Math.floor((endAt.getTime() - session.startAt.getTime()) / 60000),
  );
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        ongoing
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-border/60 bg-muted/40 text-foreground/80',
      )}
    >
      {ongoing && (
        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
      )}
      <span className="font-mono tabular-nums">
        {formatZoned(session.startAt, 'HH:mm')} – {ongoing ? t('status.inProgress') : formatZoned(session.endAt!, 'HH:mm')}
      </span>
      <span className="text-muted-foreground">· {formatDuration(t, minutes)}</span>
    </span>
  );
}
