import { formatKST } from '@/lib/time';
import { cn } from '@/lib/cn';

type Session = { startAt: Date; endAt: Date | null };

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export function SessionTimeline({
  sessions,
  now = new Date(),
}: {
  sessions: Session[];
  now?: Date;
}) {
  if (sessions.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
      <span className="w-full text-xs font-medium text-muted-foreground">근무 세션</span>
      {sessions.map((s, i) => (
        <SessionChip key={i} session={s} now={now} />
      ))}
    </div>
  );
}

function SessionChip({ session, now }: { session: Session; now: Date }) {
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
        {formatKST(session.startAt, 'HH:mm')} – {ongoing ? '진행 중' : formatKST(session.endAt!, 'HH:mm')}
      </span>
      <span className="text-muted-foreground">· {formatDuration(minutes)}</span>
    </span>
  );
}
