/**
 * Decides whose calendar is shown.
 *
 * In the route, parsing memberId and deciding permission were tangled into one ternary,
 * so where a bad input ended up was not something reading the code would tell you.
 */

export type CalendarViewer = { memberId: number; role: string };

export type CalendarTarget =
  | { ok: true; memberId: number }
  | { ok: false; reason: 'forbidden' };

/**
 * Turns the `memberId` query parameter into the member to look up.
 *
 * A missing or nonsensical value falls back to **yourself**. It is not a 400 because the
 * calendar is a landing screen, and someone who pasted a link wrong is better served by
 * their own calendar than by an error page. It never falls towards somebody else's.
 *
 * Only an admin sees another person's attendance and leave. Sharing leave across the team
 * is handled separately by /api/team/leaves.
 */
export function resolveCalendarTarget(
  memberIdRaw: string | null,
  viewer: CalendarViewer,
): CalendarTarget {
  const parsed = memberIdRaw ? Number(memberIdRaw) : null;
  const requested =
    parsed && Number.isInteger(parsed) && parsed > 0 ? parsed : viewer.memberId;

  if (requested !== viewer.memberId && viewer.role !== 'ADMIN') {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, memberId: requested };
}
