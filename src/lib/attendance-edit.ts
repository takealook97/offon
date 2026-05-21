import { z } from 'zod';
import { formatKST, kstDayKey, kstWallToUtc, utcToKstWall } from './time';

/**
 * The normalised timeline, as stored and displayed. Every time is a UTC ISO string.
 * A null end means the session is still running. Editing does not distinguish meals from breaks.
 */
export type EditTimeline = {
  startAt: string;
  endAt: string | null;
  breaks: { startAt: string; endAt: string }[];
};

const WALL = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, 'That time is not in a valid format');

/** The request body sent by the client. Times are wall clock (`yyyy-MM-ddTHH:mm`); no clockOut means still running. */
export const EditRequestBody = z.object({
  sessionId: z.coerce.number().int().positive(),
  reason: z.string().max(500).optional(),
  clockIn: WALL,
  clockOut: WALL.nullable().optional(),
  breaks: z.array(z.object({ start: WALL, end: WALL })).max(20),
});
export type EditRequestBody = z.infer<typeof EditRequestBody>;

export type TimelineInput = {
  clockIn: string;
  clockOut?: string | null;
  breaks: { start: string; end: string }[];
};

/** A session shaped for the correction dialog. Times are wall clock; a null clockOut means still running. */
export type EditableSession = {
  id: number;
  dateLabel: string;
  clockIn: string;
  clockOut: string | null;
  breaks: { start: string; end: string }[];
};

/** A stored session plus its closed breaks, shaped into an EditableSession on the server. */
export function buildEditableSession(
  session: { id: number; startAt: Date; endAt: Date | null },
  breaks: { startAt: Date; endAt: Date | null }[],
): EditableSession {
  return {
    id: session.id,
    dateLabel: formatKST(session.startAt, 'yyyy-MM-dd (EEE)'),
    clockIn: utcToKstWall(session.startAt),
    clockOut: session.endAt ? utcToKstWall(session.endAt) : null,
    breaks: breaks
      .filter((b) => b.endAt)
      .map((b) => ({ start: utcToKstWall(b.startAt), end: utcToKstWall(b.endAt!) })),
  };
}

/**
 * Converts wall-clock input into a UTC timeline while checking that it makes sense.
 * Used unchanged by the front end, for immediate feedback, and by the back end, as the trust boundary.
 * The rules: clock-in before clock-out where there is one; nothing in the future; a break starts before it ends;
 *       breaks sit inside [clock-in, clock-out or now], sorted and non-overlapping.
 */
export function buildAndValidateTimeline(
  input: TimelineInput,
  now: Date = new Date(),
): { ok: true; timeline: EditTimeline } | { ok: false; error: string } {
  const start = kstWallToUtc(input.clockIn);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: 'The clock-in time is not in a valid format' };
  }
  if (start.getTime() > now.getTime()) {
    return { ok: false, error: 'A time in the future cannot be entered' };
  }

  let end: Date | null = null;
  if (input.clockOut) {
    end = kstWallToUtc(input.clockOut);
    if (Number.isNaN(end.getTime())) {
      return { ok: false, error: 'The clock-out time is not in a valid format' };
    }
    if (start.getTime() >= end.getTime()) {
      return { ok: false, error: 'Clock-out has to come after clock-in' };
    }
    if (end.getTime() > now.getTime()) {
      return { ok: false, error: 'A time in the future cannot be entered' };
    }
  }

  const upper = end ?? now; // the ceiling for breaks: the clock-out, or now
  const parsed = input.breaks.map((b) => ({
    s: kstWallToUtc(b.start),
    e: kstWallToUtc(b.end),
  }));
  for (const b of parsed) {
    if (Number.isNaN(b.s.getTime()) || Number.isNaN(b.e.getTime())) {
      return { ok: false, error: 'The break time is not in a valid format' };
    }
    if (b.s.getTime() >= b.e.getTime()) {
      return { ok: false, error: 'A break has to end after it starts' };
    }
    if (b.s.getTime() < start.getTime() || b.e.getTime() > upper.getTime()) {
      return {
        ok: false,
        error: end
          ? 'A break has to fall between the clock-in and the clock-out'
          : 'A break has to fall between the clock-in and now',
      };
    }
  }

  const sorted = [...parsed].sort((a, b) => a.s.getTime() - b.s.getTime());
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].s.getTime() < sorted[i - 1].e.getTime()) {
      return { ok: false, error: 'The breaks overlap each other' };
    }
  }

  return {
    ok: true,
    timeline: {
      startAt: start.toISOString(),
      endAt: end ? end.toISOString() : null,
      breaks: sorted.map((b) => ({
        startAt: b.s.toISOString(),
        endAt: b.e.toISOString(),
      })),
    },
  };
}

/** A stored session and its breaks as a snapshot timeline. Only closed breaks; a running session has a null endAt. */
export function buildTimelineFromSession(
  session: { startAt: Date; endAt: Date | null },
  breaks: { startAt: Date; endAt: Date | null }[],
): EditTimeline {
  return {
    startAt: session.startAt.toISOString(),
    endAt: session.endAt ? session.endAt.toISOString() : null,
    breaks: breaks
      .filter((b) => b.endAt)
      .map((b) => ({
        startAt: b.startAt.toISOString(),
        endAt: b.endAt!.toISOString(),
      })),
  };
}

/** Reads a Prisma Json column as an EditTimeline. Only our own shape is ever stored there, so a light cast is enough. */
export function asTimeline(json: unknown): EditTimeline {
  return json as EditTimeline;
}

/**
 * Whether two timelines are the same to the minute.
 * A stored snapshot carries seconds while the input does not, so nothing-changed is decided at minute precision.
 */
export function timelinesEqualAtMinute(a: EditTimeline, b: EditTimeline): boolean {
  const minute = (iso: string) => iso.slice(0, 16);
  const norm = (t: EditTimeline) =>
    JSON.stringify({
      startAt: minute(t.startAt),
      endAt: t.endAt ? minute(t.endAt) : null,
      breaks: t.breaks.map((x) => ({ startAt: minute(x.startAt), endAt: minute(x.endAt) })),
    });
  return norm(a) === norm(b);
}

/** The date label, taken from the session start. Shown once, separately from the summary line. */
export function formatTimelineDate(t: EditTimeline): string {
  return formatKST(new Date(t.startAt), 'yyyy-MM-dd (EEE)');
}

/** How many days iso falls after baseIso, counted in local dates. */
function dayOffset(baseIso: string, iso: string): number {
  const a = kstDayKey(new Date(baseIso));
  const b = kstDayKey(new Date(iso));
  if (a === b) return 0;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** An HH:mm label, marked as next day or +N days when it falls after the session's own date. */
function timeLabel(baseIso: string, iso: string): string {
  const hhmm = formatKST(new Date(iso), 'HH:mm');
  const off = dayOffset(baseIso, iso);
  if (off <= 0) return hhmm;
  return off === 1 ? `(next day) ${hhmm}` : `(+${off} days) ${hhmm}`;
}

/** A one-line summary of times only. The date is shown separately by formatTimelineDate, and anything past midnight is marked as the next day. */
export function formatTimelineSummary(t: EditTimeline): string {
  const base = t.startAt;
  const inLabel = timeLabel(base, t.startAt);
  const outLabel = t.endAt ? timeLabel(base, t.endAt) : 'In progress';
  const breaks = t.breaks
    .map((b) => `Away ${timeLabel(base, b.startAt)} ~ ${timeLabel(base, b.endAt)}`)
    .join(', ');
  return `In ${inLabel} · Out ${outLabel}${breaks ? ` · ${breaks}` : ''}`;
}
