import { prisma } from './prisma';

export type AppSettings = {
  missingClockInNotifyEnabled: boolean;
  missingClockOutNotifyEnabled: boolean;
  lunchReminderNotifyEnabled: boolean;
  updatedAt: Date;
};

export async function getAppSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  return {
    missingClockInNotifyEnabled: row.missingClockInNotifyEnabled,
    missingClockOutNotifyEnabled: row.missingClockOutNotifyEnabled,
    lunchReminderNotifyEnabled: row.lunchReminderNotifyEnabled,
    updatedAt: row.updatedAt,
  };
}

export async function updateAppSettings(patch: {
  missingClockInNotifyEnabled?: boolean;
  missingClockOutNotifyEnabled?: boolean;
  lunchReminderNotifyEnabled?: boolean;
}): Promise<AppSettings> {
  const row = await prisma.appSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...patch },
    update: patch,
  });
  return {
    missingClockInNotifyEnabled: row.missingClockInNotifyEnabled,
    missingClockOutNotifyEnabled: row.missingClockOutNotifyEnabled,
    lunchReminderNotifyEnabled: row.lunchReminderNotifyEnabled,
    updatedAt: row.updatedAt,
  };
}
