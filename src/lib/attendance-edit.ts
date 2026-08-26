import type { MessageKey } from './i18n/dictionary';
import type { Failure } from './i18n/format';
import { z } from 'zod';
import { formatKST, kstDayKey, kstWallToUtc, utcToKstWall } from './time';

/** What kind of break is being edited. Older stored JSON may not carry this, so a missing value reads as BREAK. */
export type EditBreakKind = 'BREAK' | 'LUNCH';

/** The fixed meal length. Must match the constant in src/lib/attendance.ts. */
export const LUNCH_MINUTES = 60;

export function normalizeBreakKind(kind: unknown): EditBreakKind {
  return kind === 'LUNCH' ? 'LUNCH' : 'BREAK';
}

/**
 * The normalised timeline, as stored and displayed. Every time is a UTC ISO string.
 * A null endAt means the session is still running.
 * A meal ends at its start plus the fixed length, or at the clock-out if that comes first.
 */
export type EditTimeline = {
  startAt: string;
  endAt: string | null;
  breaks: { startAt: string; endAt: string; kind: EditBreakKind }[];
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
  // A meal's end is not taken from the client; the server recomputes it from the start plus the fixed length.
  breaks: z
    .array(
      z.object({
        start: WALL,
        end: WALL,
        kind: z.enum(['BREAK', 'LUNCH']).optional(),
      }),
    )
    .max(20),
});
export type EditRequestBody = z.infer<typeof EditRequestBody>;

export type TimelineInput = {
  clockIn: string;
  clockOut?: string | null;
  breaks: { start: string; end: string; kind?: EditBreakKind }[];
};

/** A session shaped for the correction dialog. Times are wall clock; a null clockOut means still running. */
export type EditableSession = {
  id: number;
  dateLabel: string;
  clockIn: string;
  clockOut: string | null;
  breaks: { start: string; end: string; kind: EditBreakKind }[];
};

/** A stored session plus its closed breaks, shaped into an EditableSession on the server. */
export function buildEditableSession(
  session: { id: number; startAt: Date; endAt: Date | null },
  breaks: { startAt: Date; endAt: Date | null; kind?: string }[],
): EditableSession {
  return {
    id: session.id,
    dateLabel: formatKST(session.startAt, 'yyyy-MM-dd (EEE)'),
    clockIn: utcToKstWall(session.startAt),
    clockOut: session.endAt ? utcToKstWall(session.endAt) : null,
    breaks: breaks
      .filter((b) => b.endAt)
      .map((b) => ({
        start: utcToKstWall(b.startAt),
        end: utcToKstWall(b.endAt!),
        kind: normalizeBreakKind(b.kind),
      })),
  };
}

/**
 * Converts wall-clock input into a UTC timeline while checking that it makes sense.
 * Used unchanged by the front end, for immediate feedback, and by the back end, as the trust boundary.
 * The rules: clock-in before clock-out where there is one; nothing in the future; a break starts before it ends;
 *       breaks sit inside [clock-in, clock-out or now], sorted and non-overlapping.
 * A meal takes no end from the input; it is derived as start plus the fixed length, or the clock-out if earlier,
 * A meal in progress may legitimately end in the future, so the no-future rule is not applied to its end.
 */
export function buildAndValidateTimeline(
  input: TimelineInput,
  now: Date = new Date(),
):
  | { ok: true; timeline: EditTimeline }
  /** Failures are message keys. The screen and Slack each render them in their own language. */
  | ({ ok: false } & Failure) {
  const start = kstWallToUtc(input.clockIn);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, messageKey: 'valid.badClockInFormat' };
  }
  if (start.getTime() > now.getTime()) {
    return { ok: false, messageKey: 'valid.noFutureTime' };
  }

  let end: Date | null = null;
  if (input.clockOut) {
    end = kstWallToUtc(input.clockOut);
    if (Number.isNaN(end.getTime())) {
      return { ok: false, messageKey: 'valid.badClockOutFormat' };
    }
    if (start.getTime() >= end.getTime()) {
      return { ok: false, messageKey: 'valid.clockOutBeforeIn' };
    }
    if (end.getTime() > now.getTime()) {
      return { ok: false, messageKey: 'valid.noFutureTime' };
    }
  }

  const upper = end ?? now; // the ceiling for breaks: the clock-out, or now
  const parsed: { s: Date; e: Date; kind: EditBreakKind }[] = [];
  for (const b of input.breaks) {
    const kind = normalizeBreakKind(b.kind);
    const labelKey: MessageKey = kind === 'LUNCH' ? 'edit.meal' : 'edit.away';
    const s = kstWallToUtc(b.start);
    // A meal ends at its start plus the fixed length, never at an input value; it only moves.
    // Why it is not trimmed to the clock-out: its length would jump around on every unrelated edit,
    // such as correcting a clock-out. Anything out of range is reported as an error below.
    const e =
      kind === 'LUNCH'
        ? new Date(s.getTime() + LUNCH_MINUTES * 60_000)
        : kstWallToUtc(b.end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      return { ok: false, messageKey: 'valid.breakBadFormat', kindKey: labelKey };
    }
    if (s.getTime() >= e.getTime()) {
      return { ok: false, messageKey: 'valid.breakEndBeforeStart', kindKey: labelKey };
    }
    // A meal still running may end in the future, so with no clock-out the ceiling is checked
    // against its start. With a clock-out, the whole meal has to fit inside the working span.
    const overUpper =
      kind === 'LUNCH' && !end
        ? s.getTime() > upper.getTime()
        : e.getTime() > upper.getTime();
    if (s.getTime() < start.getTime() || overUpper) {
      return {
        ok: false,
        messageKey: end ? 'valid.breakOutsideShift' : 'valid.breakOutsideOpen',
        kindKey: labelKey,
      };
    }
    parsed.push({ s, e, kind });
  }

  const sorted = [...parsed].sort((a, b) => a.s.getTime() - b.s.getTime());
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].s.getTime() < sorted[i - 1].e.getTime()) {
      return { ok: false, messageKey: 'valid.breaksOverlap' };
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
        kind: b.kind,
      })),
    },
  };
}

/** A stored session and its breaks as a snapshot timeline. Only closed breaks; a running session has a null endAt. */
export function buildTimelineFromSession(
  session: { startAt: Date; endAt: Date | null },
  breaks: { startAt: Date; endAt: Date | null; kind?: string }[],
): EditTimeline {
  return {
    startAt: session.startAt.toISOString(),
    endAt: session.endAt ? session.endAt.toISOString() : null,
    breaks: breaks
      .filter((b) => b.endAt)
      .map((b) => ({
        startAt: b.startAt.toISOString(),
        endAt: b.endAt!.toISOString(),
        kind: normalizeBreakKind(b.kind),
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
      breaks: t.breaks.map((x) => ({
        startAt: minute(x.startAt),
        endAt: minute(x.endAt),
        kind: normalizeBreakKind(x.kind),
      })),
    });
  return norm(a) === norm(b);
}

export type TimelineMergeConflict = 'startAt' | 'endAt' | 'breaks' | 'range';

export type TimelineMergeResult =
  | { ok: true; timeline: EditTimeline }
  | { ok: false; conflicts: TimelineMergeConflict[] };

const isoMinute = (iso: string) => iso.slice(0, 16);
const nullableIsoMinute = (iso: string | null) => (iso ? isoMinute(iso) : null);

function mergeScalar(
  base: string | null,
  proposed: string | null,
  live: string | null,
): { ok: true; value: string | null } | { ok: false } {
  const baseMinute = nullableIsoMinute(base);
  const proposedMinute = nullableIsoMinute(proposed);
  const liveMinute = nullableIsoMinute(live);

  // Anything the request left alone keeps whatever happened since, such as a clock-out.
  if (proposedMinute === baseMinute) return { ok: true, value: live };
  // If the live value is unchanged, take the request's change.
  if (liveMinute === baseMinute) return { ok: true, value: proposed };
  // Both changed to the same result, so this is not a conflict. Take the request's value.
  if (proposedMinute === liveMinute) return { ok: true, value: proposed };
  return { ok: false };
}

function breakKey(b: EditTimeline['breaks'][number]): string {
  return `${isoMinute(b.startAt)}|${isoMinute(b.endAt)}|${normalizeBreakKind(b.kind)}`;
}

function breakCounts(breaks: EditTimeline['breaks']): Map<string, number> {
  const counts = new Map<string, number>();
  for (const b of breaks) {
    const key = breakKey(b);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function sameBreaksAtMinute(
  a: EditTimeline['breaks'],
  b: EditTimeline['breaks'],
): boolean {
  if (a.length !== b.length) return false;
  const counts = breakCounts(a);
  for (const item of b) {
    const key = breakKey(item);
    const left = counts.get(key) ?? 0;
    if (left === 0) return false;
    if (left === 1) counts.delete(key);
    else counts.set(key, left - 1);
  }
  return counts.size === 0;
}

function subtractBreaks(
  source: EditTimeline['breaks'],
  subtract: EditTimeline['breaks'],
): EditTimeline['breaks'] | null {
  const remaining = breakCounts(subtract);
  const extras: EditTimeline['breaks'] = [];
  for (const item of source) {
    const key = breakKey(item);
    const left = remaining.get(key) ?? 0;
    if (left === 0) extras.push(item);
    else if (left === 1) remaining.delete(key);
    else remaining.set(key, left - 1);
  }
  return remaining.size === 0 ? extras : null;
}

function mergeBreaks(
  base: EditTimeline['breaks'],
  proposed: EditTimeline['breaks'],
  live: EditTimeline['breaks'],
): EditTimeline['breaks'] | null {
  if (sameBreaksAtMinute(proposed, base)) return live;
  if (sameBreaksAtMinute(live, base)) return proposed;
  if (sameBreaksAtMinute(proposed, live)) return proposed;

  // When both changed: if the live side still holds the original breaks and has only added
  // new ones, the request's change merges safely. If an original break was edited or removed,
  // we do not guess which change should win and report a conflict instead.
  const liveAdditions = subtractBreaks(live, base);
  if (!liveAdditions) return null;

  // The same break added on both sides is kept once.
  const proposedAdditions = subtractBreaks(proposed, base) ?? proposed;
  const unmatchedProposedAdditions = breakCounts(proposedAdditions);
  const additionsToKeep: EditTimeline['breaks'] = [];
  for (const item of liveAdditions) {
    const key = breakKey(item);
    const left = unmatchedProposedAdditions.get(key) ?? 0;
    if (left === 0) additionsToKeep.push(item);
    else if (left === 1) unmatchedProposedAdditions.delete(key);
    else unmatchedProposedAdditions.set(key, left - 1);
  }

  return [...proposed, ...additionsToKeep].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );
}

function timelineRangeIsValid(timeline: EditTimeline): boolean {
  const startAt = Date.parse(timeline.startAt);
  const endAt = timeline.endAt ? Date.parse(timeline.endAt) : null;
  if (!Number.isFinite(startAt) || (endAt !== null && !Number.isFinite(endAt))) return false;
  if (endAt !== null && startAt >= endAt) return false;

  let previousEnd = startAt;
  for (const b of timeline.breaks) {
    const breakStart = Date.parse(b.startAt);
    const breakEnd = Date.parse(b.endAt);
    if (!Number.isFinite(breakStart) || !Number.isFinite(breakEnd)) return false;
    if (breakStart < startAt || breakStart >= breakEnd) return false;
    if (endAt !== null && breakEnd > endAt) return false;
    if (breakStart < previousEnd) return false;
    previousEnd = breakEnd;
  }
  return true;
}

/**
 * Merges the original as it was at request time, the proposed change, and the live value at approval.
 *
 * - Clock-in and clock-out fields the request did not touch keep the live value.
 * - If the request did not touch breaks, every meal and break added since is kept.
 * - Even when both sides changed breaks, the request merges as long as the live side
 *   only added records and left the originals alone.
 * - The same field, or the same original break, changed differently is a conflict, as is an overlapping merge.
 */
export function mergeAttendanceEditTimeline(
  base: EditTimeline,
  proposed: EditTimeline,
  live: EditTimeline,
): TimelineMergeResult {
  const conflicts: TimelineMergeConflict[] = [];
  const startAt = mergeScalar(base.startAt, proposed.startAt, live.startAt);
  const endAt = mergeScalar(base.endAt, proposed.endAt, live.endAt);
  const breaks = mergeBreaks(base.breaks, proposed.breaks, live.breaks);

  if (!startAt.ok) conflicts.push('startAt');
  if (!endAt.ok) conflicts.push('endAt');
  if (!breaks) conflicts.push('breaks');
  if (!startAt.ok || !endAt.ok || !breaks) return { ok: false, conflicts };

  const timeline: EditTimeline = {
    startAt: startAt.value!,
    endAt: endAt.value,
    breaks,
  };
  if (!timelineRangeIsValid(timeline)) return { ok: false, conflicts: ['range'] };
  return { ok: true, timeline };
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
    .map(
      (b) =>
        `${normalizeBreakKind(b.kind) === 'LUNCH' ? 'Meal' : 'Away'} ` +
        `${timeLabel(base, b.startAt)} ~ ${timeLabel(base, b.endAt)}`,
    )
    .join(', ');
  return `In ${inLabel} · Out ${outLabel}${breaks ? ` · ${breaks}` : ''}`;
}
