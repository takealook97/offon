import { prisma } from './prisma';
import { DEFAULT_WORK_HOURS, type WorkHours } from './work-hours';

/**
 * Organisation policy. Unlike the reminder toggles, the room hours and meal length feed
 * domain validation, so the values are passed into the pure validators as arguments rather
 * than having those validators import this module.
 */
export type AppSettings = {
  missingClockInNotifyEnabled: boolean;
  missingClockOutNotifyEnabled: boolean;
  /** The bookable window for meeting rooms, in minutes from midnight. */
  roomOpenMinutes: number;
  roomCloseMinutes: number;
  /** The fixed meal length, in minutes. Applies only to meals started from now on. */
  mealMinutes: number;
  /** Working hours, in minutes from midnight. The standard day, the half-day credit and the half-day split all derive from these. */
  workStartMinutes: number;
  workEndMinutes: number;
  updatedAt: Date;
};

type Row = {
  missingClockInNotifyEnabled: boolean;
  missingClockOutNotifyEnabled: boolean;
  roomOpenMinutes: number;
  roomCloseMinutes: number;
  mealMinutes: number;
  workStartMinutes: number;
  workEndMinutes: number;
  updatedAt: Date;
};

function toSettings(row: Row): AppSettings {
  return {
    missingClockInNotifyEnabled: row.missingClockInNotifyEnabled,
    missingClockOutNotifyEnabled: row.missingClockOutNotifyEnabled,
    roomOpenMinutes: row.roomOpenMinutes,
    roomCloseMinutes: row.roomCloseMinutes,
    mealMinutes: row.mealMinutes,
    workStartMinutes: row.workStartMinutes,
    workEndMinutes: row.workEndMinutes,
    updatedAt: row.updatedAt,
  };
}

/** Used when no row exists yet. Must match the schema defaults. */
const DEFAULTS: AppSettings = {
  missingClockInNotifyEnabled: false,
  missingClockOutNotifyEnabled: false,
  roomOpenMinutes: 8 * 60,
  roomCloseMinutes: 19 * 60,
  mealMinutes: DEFAULT_WORK_HOURS.mealMinutes,
  workStartMinutes: DEFAULT_WORK_HOURS.workStartMinutes,
  workEndMinutes: DEFAULT_WORK_HOURS.workEndMinutes,
  updatedAt: new Date(0),
};

/**
 * Reading does not write. This used to upsert the row, so two concurrent reads both tried
 * to create id=1, collided on the unique constraint, and one of them failed. It became
 * reproducible once starting a meal began reading settings: two people pressing at the same
 * moment, and one gets a 500.
 */
export async function getAppSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.findUnique({ where: { id: 1 } });
  return row ? toSettings(row) : DEFAULTS;
}

export type AppSettingsPatch = {
  missingClockInNotifyEnabled?: boolean;
  missingClockOutNotifyEnabled?: boolean;
  roomOpenMinutes?: number;
  roomCloseMinutes?: number;
  mealMinutes?: number;
  workStartMinutes?: number;
  workEndMinutes?: number;
};

export async function updateAppSettings(patch: AppSettingsPatch): Promise<AppSettings> {
  const row = await prisma.appSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...patch },
    update: patch,
  });
  return toSettings(row);
}

/** Just the room hours, shaped for the validators. */
export async function roomHours(): Promise<{ openMinutes: number; closeMinutes: number }> {
  const s = await getAppSettings();
  return { openMinutes: s.roomOpenMinutes, closeMinutes: s.roomCloseMinutes };
}

/** Just the working hours, shaped to pass straight into the derivations in work-hours.ts. */
export async function workHours(): Promise<WorkHours> {
  const s = await getAppSettings();
  return {
    workStartMinutes: s.workStartMinutes,
    workEndMinutes: s.workEndMinutes,
    mealMinutes: s.mealMinutes,
  };
}
