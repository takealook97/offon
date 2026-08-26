import { z } from 'zod';

/**
 * Validation for the admin settings save request.
 *
 * Inside the route, checking the schema meant standing up a request. Out here, "this
 * combination is refused" can be asserted directly.
 *
 * Loose validation lets one visit to the settings screen throw off working-time
 * calculations for the whole organisation, and it compounds daily until someone undoes it.
 */

const minuteOfDay = z.number().int().min(0).max(24 * 60);

/** Under five minutes is a mis-click; over four hours is not a break but a split shift. */
const mealLength = z.number().int().min(5).max(240);

export const SettingsPatchBody = z
  .object({
    missingClockInNotifyEnabled: z.boolean().optional(),
    missingClockOutNotifyEnabled: z.boolean().optional(),
    roomOpenMinutes: minuteOfDay.optional(),
    roomCloseMinutes: minuteOfDay.optional(),
    mealMinutes: mealLength.optional(),
    workStartMinutes: minuteOfDay.optional(),
    workEndMinutes: minuteOfDay.optional(),
  })
  // Sending one side alone would have to be compared against the stored value, so a window is sent whole or not at all.
  .refine(
    (v) =>
      v.roomOpenMinutes === undefined ||
      v.roomCloseMinutes === undefined ||
      v.roomCloseMinutes > v.roomOpenMinutes,
    { message: 'closing time must come after opening time' },
  )
  .refine(
    (v) =>
      v.workStartMinutes === undefined ||
      v.workEndMinutes === undefined ||
      v.workEndMinutes > v.workStartMinutes,
    { message: 'work must end after it starts' },
  )
  // A meal that fills the whole window leaves a standard day of zero, so every minute
  // clocked counts as overtime and a half day is worth nothing. Refuse it before it is saved.
  .refine(
    (v) =>
      v.workStartMinutes === undefined ||
      v.workEndMinutes === undefined ||
      v.mealMinutes === undefined ||
      v.workEndMinutes - v.workStartMinutes > v.mealMinutes,
    { message: 'the work day must be longer than the meal' },
  );

export type SettingsPatch = z.infer<typeof SettingsPatchBody>;
