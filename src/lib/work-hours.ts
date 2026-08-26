/**
 * The values derived from the organisation's working hours.
 *
 * 09:00 to 18:00 used to be written out as separate constants in three places: the 09, 13
 * and 18 behind half-day calendar events, the 480-minute overtime threshold, and the 480
 * standard day and 240 half-day credit in the Excel export. They are derived from one
 * another, but spelled out apart, so changing one left the screen and the totals quietly
 * disagreeing. Making the hours configurable is the moment to write that relationship down
 * in one place.
 *
 * Pure functions. Reading the settings row is the caller's job; this takes only numbers.
 */

/** A working day and its meal. Times are minutes from midnight; the meal is a duration in minutes. */
export type WorkHours = {
  workStartMinutes: number;
  workEndMinutes: number;
  mealMinutes: number;
};

/** The same values that used to be hardcoded. Used before a settings row exists. */
export const DEFAULT_WORK_HOURS: WorkHours = {
  workStartMinutes: 540, // 09:00
  workEndMinutes: 1080, // 18:00
  mealMinutes: 60,
};

/**
 * The standard working day, in minutes: the length of the window minus the meal.
 *
 * 09:00 to 18:00 with a 60-minute meal gives 480, the old `STANDARD_MINUTES`.
 * Overtime is whatever is worked beyond this.
 *
 * Never goes negative, even for the nonsensical combination of a meal longer than the
 * window. A negative standard day would register overtime for a day nobody worked.
 */
export function standardWorkMinutes(h: WorkHours): number {
  return Math.max(0, h.workEndMinutes - h.workStartMinutes - h.mealMinutes);
}

/**
 * What one half day is worth, in minutes: half a standard day.
 *
 * 240 at the defaults, the old `HALF_DAY_CREDIT_MINUTES`.
 */
export function halfDayCreditMinutes(h: WorkHours): number {
  return standardWorkMinutes(h) / 2;
}

/**
 * Where a morning half day ends and an afternoon one begins, in minutes from midnight:
 * the start of the day plus the half-day credit.
 *
 * 780, or 13:00, at the defaults — the 13 that used to sit in `halfDayIsoRange`. What
 * matters is that this is **not** the midpoint of the window. Take the morning off and you
 * are away 09:00 to 13:00; take the afternoon off and you work 09:00 to 13:00 and leave.
 * Either way the real work matches the credit, four hours. Using the midpoint, 13:30, would
 * give the morning half an extra thirty minutes the afternoon half never gets.
 */
export function halfDaySplitMinutes(h: WorkHours): number {
  return h.workStartMinutes + halfDayCreditMinutes(h);
}

/** The span a half day occupies, in minutes from midnight. */
export function halfDayBounds(
  h: WorkHours,
  type: 'HALF_DAY_AM' | 'HALF_DAY_PM',
): { startMinutes: number; endMinutes: number } {
  const split = halfDaySplitMinutes(h);
  return type === 'HALF_DAY_AM'
    ? { startMinutes: h.workStartMinutes, endMinutes: split }
    : { startMinutes: split, endMinutes: h.workEndMinutes };
}
