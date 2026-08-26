import { execSync } from 'node:child_process';
import { prisma } from '@/lib/prisma';

/**
 * Helpers for tests that use a real database.
 *
 * Kept apart from the pure tests because they run under different conditions. These need
 * Postgres up, and without it they must fail loudly rather than pass quietly: a test that
 * never ran looking like a test that passed is the worst outcome available.
 *
 * This must point at a different database from the development one, because every test empties every table.
 */
const url = process.env.DATABASE_URL;

// The same prisma singleton the app uses. A separate test client would take a different
// path from the real code and miss the very thing being checked. The safeguard instead is
// that DATABASE_URL has to point at a test database, since everything is emptied each time.
if (!url || !/_test(\?|$)/.test(url)) {
  throw new Error(
    `DATABASE_URL must point at a database whose name ends in _test (got: ${url ?? 'unset'}). ` +
      'These tests truncate every table.',
  );
}

export { prisma };

let migrated = false;

/** Brings the schema up to date, once. */
export function ensureSchema(): void {
  if (migrated) return;
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  migrated = true;
}

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

/**
 * Empties the data between tests. Sequences are reset too, so no test can come to depend on
 * the ids another one happened to create.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`,
  );
}

/** The minimum member an attendance scenario needs. */
export async function createMember(name = 'Test Member') {
  const suffix = Math.random().toString(36).slice(2, 10);
  return prisma.member.create({
    data: {
      name,
      slackId: `U${suffix}`,
      email: `${suffix}@example.com`,
      role: 'EMPLOYEE',
    },
  });
}
