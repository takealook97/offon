import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

/**
 * Puts the end-to-end database into a known state.
 *
 * Called from global setup, and safe to call again: it empties every table first. The database
 * it points at must be named with an `_e2e` suffix, and it refuses to run otherwise — the
 * development and unit-test databases must never be reachable from here.
 */

export const ADMIN = { name: 'Ada Admin', email: 'ada@example.com', slackId: 'U-ADMIN' };
export const EMPLOYEE = { name: 'Eve Employee', email: 'eve@example.com', slackId: 'U-EMP' };

/** The code the sign-in tests type. Stored hashed, exactly as a real one is. */
export const LOGIN_CODE = '123456';

const TABLES = [
  'attendance_breaks',
  'attendance_sessions',
  'attendance_edit_requests',
  'attendances',
  'leave_requests',
  'leave_balances',
  'login_codes',
  'room_booking_reminders',
  'room_booking_attendees',
  'room_bookings',
  'meeting_rooms',
  'holidays',
  'audit_logs',
  'app_settings',
  'members',
];

export async function seed(databaseUrl: string): Promise<void> {
  if (!/_e2e(\?|$)/.test(databaseUrl)) {
    throw new Error(
      `the e2e database name must end in _e2e (got: ${databaseUrl}). Every table in it is emptied.`,
    );
  }
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`,
    );

    const admin = await prisma.member.create({ data: { ...ADMIN, role: 'ADMIN' } });
    const employee = await prisma.member.create({ data: { ...EMPLOYEE, role: 'EMPLOYEE' } });

    // baseDays is a Decimal column; the rollover year is the year the balance was granted for.
    const year = new Date().getUTCFullYear();
    await prisma.leaveBalance.createMany({
      data: [admin, employee].map((m) => ({
        memberId: m.id,
        baseDays: 15,
        bonusDays: 0,
        usedDays: 0,
        rolloverYear: year,
      })),
    });

    // A valid sign-in code for each of them, hashed the way lib/otp.ts hashes one. Slack is
    // never called, so this is what stands in for the DM.
    const pepper = process.env.OTP_PEPPER;
    if (!pepper) throw new Error('OTP_PEPPER must be set for the e2e seed');
    const codeHash = await argon2.hash(LOGIN_CODE + pepper, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.loginCode.createMany({
      data: [admin, employee].map((m) => ({ memberId: m.id, codeHash, expiresAt })),
    });

    await prisma.meetingRoom.create({ data: { name: 'Board Room' } });
  } finally {
    await prisma.$disconnect();
  }
}
