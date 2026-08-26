import { countBusinessDays } from './time';

export type LeaveTypeValue = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';

/**
 * The number of leave days, recounted against the holidays as they stand at approval.
 *
 * Counted at approval rather than at request, because a holiday can be added in between.
 * When that happens the person takes fewer days off, but the old count still comes out of their balance.
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
