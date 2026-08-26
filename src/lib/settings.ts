import { prisma } from './prisma';

/**
 * Organisation policy. Unlike the reminder toggles, the room hours and meal length feed domain validation, so
 * the values are passed into the pure validators as arguments, rather than having them import this module.
 */
export type AppSettings = {
  missingClockInNotifyEnabled: boolean;
  missingClockOutNotifyEnabled: boolean;
  /** The bookable window for meeting rooms, in minutes from midnight. */
  roomOpenMinutes: number;
  roomCloseMinutes: number;
  /** The fixed meal length, in minutes. Applies only to meals started from now on. */
  mealMinutes: number;
  updatedAt: Date;
};

type Row = {
  missingClockInNotifyEnabled: boolean;
  missingClockOutNotifyEnabled: boolean;
  roomOpenMinutes: number;
  roomCloseMinutes: number;
  mealMinutes: number;
  updatedAt: Date;
};

function toSettings(row: Row): AppSettings {
  return {
    missingClockInNotifyEnabled: row.missingClockInNotifyEnabled,
    missingClockOutNotifyEnabled: row.missingClockOutNotifyEnabled,
    roomOpenMinutes: row.roomOpenMinutes,
    roomCloseMinutes: row.roomCloseMinutes,
    mealMinutes: row.mealMinutes,
    updatedAt: row.updatedAt,
  };
}

export async function getAppSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  return toSettings(row);
}

export type AppSettingsPatch = {
  missingClockInNotifyEnabled?: boolean;
  missingClockOutNotifyEnabled?: boolean;
  roomOpenMinutes?: number;
  roomCloseMinutes?: number;
  mealMinutes?: number;
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
