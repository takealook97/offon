import { countBusinessDays } from './time';

export type LeaveTypeValue = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

/**
 * The number of leave days, recounted against the holidays as they stand at approval.
 *
 * Counted at approval rather than at request because a holiday can be added in between.
 * When that happens the person actually takes fewer days off, but the old count would still
 * come out of their balance.
 *
 * A half day covers one date, so it is a fixed 0.5 — unless that date is a holiday, in
 * which case it is 0. The caller reads 0 as nothing to approve and suggests rejecting:
 * approving a zero would leave a record of leave nobody took.
 */
export function recomputeLeaveDays(
  type: LeaveTypeValue,
  startStr: string,
  endStr: string,
  holidays: ReadonlySet<string>,
): number {
  if (type === 'FULL_DAY') return countBusinessDays(startStr, endStr, holidays);
  return holidays.has(startStr) ? 0 : 0.5;
}

/** The rollover runs only in the first week of January. The window is wide enough that a late scheduler still catches it once. */
export const ROLLOVER_WINDOW_MAX_DAY = 7;

/** The leave a new joiner gets in their first year. */
export const BASE_DEFAULT = 15;

export function isRolloverWindow(month: number, day: number): boolean {
  return month === 1 && day <= ROLLOVER_WINDOW_MAX_DAY;
}

/**
 * The new baseline entitlement when the year turns over.
 *
 * At or above the baseline it grows by a day a year; below it, as happens with a pro-rated
 * first year, it rises to the baseline. It never falls: losing leave after another year of
 * service would simply be wrong.
 */
export function nextBaseDays(currentBase: number): number {
  return currentBase >= BASE_DEFAULT ? currentBase + 1 : BASE_DEFAULT;
}
