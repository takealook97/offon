import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import {
  resolveMonthRange,
  buildIndividualReport,
  buildOrgReport,
  type ResolvedMonthRange,
  type DailyRow,
} from './attendance-export';
import { wallToUtc, isBusinessDayDateStr } from './time';
import { DEFAULT_WORK_HOURS, standardWorkMinutes, halfDayCreditMinutes } from './work-hours';

/**
 * Assembling the spreadsheet. The month boundaries are pinned in attendance-export.test.ts;
 * what is pinned here is what lands in the cells — how leave is credited, which bucket a day
 * falls into, and who appears at all.
 *
 * These numbers are what an accountant is handed, so the failure mode is not a crash. It is a
 * plausible number that is wrong, which is why every case below asserts an amount rather than
 * merely that a row exists.
 */

const STANDARD_DAY = standardWorkMinutes(DEFAULT_WORK_HOURS);
const HALF_DAY_CREDIT = halfDayCreditMinutes(DEFAULT_WORK_HOURS);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A finished month, so the range is not truncated by "yesterday". */
const NOW = new Date('2026-08-15T03:00:00Z');
let range: ResolvedMonthRange;

before(() => {
  ensureSchema();
  const r = resolveMonthRange(2026, 6, NOW);
  assert.equal(r.ok, true);
  if (r.ok) range = r;
});
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

/** The first day in the range that counts towards the baseline, and the first that does not. */
const businessDay = () => range.dayKeys.find((k) => isBusinessDayDateStr(k, new Set()))!;
const weekendDay = () => range.dayKeys.find((k) => !isBusinessDayDateStr(k, new Set()))!;

/** A finished day: one closed session, optionally with one closed break inside it. */
async function workedDay(
  memberId: number,
  dayKey: string,
  opts: { fromHour?: number; hours: number; breakMinutes?: number } = { hours: 8 },
) {
  const from = opts.fromHour ?? 9;
  const startAt = wallToUtc(`${dayKey}T${String(from).padStart(2, '0')}:00`);
  const endAt = new Date(startAt.getTime() + opts.hours * 60 * 60_000);
  const attendance = await prisma.attendance.create({
    data: {
      memberId,
      workDate: new Date(`${dayKey}T00:00:00Z`),
      status: 'DONE',
      clockInAt: startAt,
      clockOutAt: endAt,
    },
  });
  const session = await prisma.attendanceSession.create({
    data: { attendanceId: attendance.id, startAt, endAt },
  });
  if (opts.breakMinutes) {
    const bStart = new Date(startAt.getTime() + 60 * 60_000);
    await prisma.attendanceBreak.create({
      data: {
        attendanceId: attendance.id,
        sessionId: session.id,
        startAt: bStart,
        endAt: new Date(bStart.getTime() + opts.breakMinutes * 60_000),
      },
    });
  }
  return attendance;
}

async function approvedLeave(
  memberId: number,
  dayKey: string,
  type: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM',
) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  return prisma.leaveRequest.create({
    data: { memberId, type, startDate: date, endDate: date, days: 1, status: 'APPROVED' },
  });
}

const individual = (memberId: number) =>
  buildIndividualReport({ memberId, range, now: NOW, weekdays: WEEKDAYS });
const org = () => buildOrgReport({ range, now: NOW, weekdays: WEEKDAYS });

const rowFor = (rows: DailyRow[], dayKey: string) =>
  rows.find((r) => r.date.startsWith(dayKey.replace(/-/g, '.')))!;

test('an unknown member has no report', async () => {
  // Act + Assert
  assert.equal(await individual(999_999), null);
});

test('a deactivated member has no report', async () => {
  // Arrange
  const m = await createMember();
  await prisma.member.update({ where: { id: m.id }, data: { deletedAt: new Date() } });

  // Act + Assert
  assert.equal(await individual(m.id), null);
});

test('the table has one row per day in the range', async () => {
  // Arrange
  const m = await createMember();

  // Act
  const report = await individual(m.id);

  // Assert
  assert.equal(report?.rows.length, range.dayKeys.length);
  assert.equal(report?.yyyymm, '202606');
});

test('a worked weekday counts towards the weekday total', async () => {
  // Arrange
  const m = await createMember();
  const day = businessDay();
  await workedDay(m.id, day, { hours: 8 });

  // Act
  const report = await individual(m.id);

  // Assert
  const row = rowFor(report!.rows, day);
  assert.equal(row.workMinutes, 8 * 60, 'time on the clock');
  assert.equal(row.sumMinutes, 8 * 60, 'credited');
  assert.equal(report!.summary.weekdaySumMinutes, 8 * 60);
});

test('a break comes off the credited time but stays on the clock', async () => {
  // Arrange
  const m = await createMember();
  const day = businessDay();
  await workedDay(m.id, day, { hours: 8, breakMinutes: 30 });

  // Act
  const report = await individual(m.id);

  // Assert
  const row = rowFor(report!.rows, day);
  assert.equal(row.workMinutes, 8 * 60, 'the clock still ran for eight hours');
  assert.equal(row.breakMinutes, 30);
  assert.equal(row.sumMinutes, 8 * 60 - 30, 'only the worked part is credited');
});

test('a full day of leave is credited a standard day with nothing worked', async () => {
  // Arrange
  const m = await createMember();
  const day = businessDay();
  await approvedLeave(m.id, day, 'FULL_DAY');

  // Act
  const report = await individual(m.id);

  // Assert
  const row = rowFor(report!.rows, day);
  assert.equal(row.workMinutes, 0);
  assert.equal(row.sumMinutes, STANDARD_DAY);
});

test('a half day is credited on top of whatever was actually worked', async () => {
  // Arrange
  const m = await createMember();
  const day = businessDay();
  await workedDay(m.id, day, { fromHour: 13, hours: 4 });
  await approvedLeave(m.id, day, 'HALF_DAY_AM');

  // Act
  const report = await individual(m.id);

  // Assert
  const row = rowFor(report!.rows, day);
  assert.equal(row.sumMinutes, 4 * 60 + HALF_DAY_CREDIT);
});

test('a non-business day is kept apart from the weekday total', async () => {
  // Arrange
  const m = await createMember();
  await workedDay(m.id, weekendDay(), { hours: 5 });

  // Act
  const report = await individual(m.id);

  // Assert
  const s = report!.summary;
  assert.equal(s.holidaySumMinutes, 5 * 60);
  assert.equal(s.weekdaySumMinutes, 0, 'weekend work is not weekday work');
  assert.equal(s.totalSumMinutes, 5 * 60);
});

test('a configured holiday moves a weekday into the holiday bucket', async () => {
  // Arrange
  const m = await createMember();
  const day = businessDay();
  await prisma.holiday.create({ data: { date: new Date(`${day}T00:00:00Z`), name: 'Founders Day' } });
  await workedDay(m.id, day, { hours: 6 });

  // Act
  const report = await individual(m.id);

  // Assert
  assert.equal(rowFor(report!.rows, day).isHoliday, true);
  assert.equal(report!.summary.holidaySumMinutes, 6 * 60);
  assert.equal(report!.summary.weekdaySumMinutes, 0);
  // And the day stops being expected of anyone, so nobody owes a standard day for it.
  const businessDays = range.dayKeys.filter((k) => isBusinessDayDateStr(k, new Set()));
  assert.equal(
    report!.summary.baselineMinutes,
    (businessDays.length - 1) * STANDARD_DAY,
    'a configured holiday lowers the baseline by one standard day',
  );
});

test('the baseline is one standard day per business day', async () => {
  // Arrange
  const m = await createMember();
  const businessDays = range.dayKeys.filter((k) => isBusinessDayDateStr(k, new Set()));

  // Act
  const report = await individual(m.id);

  // Assert
  assert.equal(report!.summary.baselineMinutes, businessDays.length * STANDARD_DAY);
});

test('overtime is what was credited less the baseline, and goes negative when short', async () => {
  // Arrange: a single eight-hour day against a whole month of baseline.
  const m = await createMember();
  await workedDay(m.id, businessDay(), { hours: 8 });

  // Act
  const s = (await individual(m.id))!.summary;

  // Assert
  assert.equal(s.overtimeMinutes, s.weekdaySumMinutes - s.baselineMinutes);
  assert.ok(s.overtimeMinutes < 0, 'one day worked in a month is not overtime');
});

test('the org sheet gives each person their own numbers', async () => {
  // Arrange
  const busy = await createMember('Busy');
  await createMember('Quiet');
  await workedDay(busy.id, businessDay(), { hours: 8 });

  // Act
  const report = await org();

  // Assert
  const row = (name: string) => report.rows.find((r) => r.name === name)!;
  assert.equal(row('Busy').summary.weekdaySumMinutes, 8 * 60);
  assert.equal(row('Quiet').summary.weekdaySumMinutes, 0);
});

test('the org sheet leaves the CEO out but keeps people with no position', async () => {
  // Arrange
  const ceo = await createMember('Chief');
  await prisma.member.update({ where: { id: ceo.id }, data: { position: 'CEO' } });
  await createMember('Nobody In Particular');

  // Act
  const report = await org();

  // Assert
  const names = report.rows.map((r) => r.name);
  assert.ok(!names.includes('Chief'), 'the CEO is not in the org totals');
  assert.ok(names.includes('Nobody In Particular'), 'an empty position is not a reason to drop someone');
});

test('the org sheet leaves out people who have left', async () => {
  // Arrange
  const gone = await createMember('Departed');
  await createMember('Still Here');
  await prisma.member.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

  // Act
  const report = await org();

  // Assert
  assert.deepEqual(report.rows.map((r) => r.name), ['Still Here']);
});

test('leave belonging to someone else does not credit this person', async () => {
  // Arrange
  const mine = await createMember('Mine');
  const theirs = await createMember('Theirs');
  await approvedLeave(theirs.id, businessDay(), 'FULL_DAY');

  // Act
  const report = await individual(mine.id);

  // Assert
  assert.equal(report!.summary.weekdaySumMinutes, 0);
});

test('leave that was not approved credits nothing', async () => {
  // Arrange
  const m = await createMember();
  const day = businessDay();
  const date = new Date(`${day}T00:00:00Z`);
  await prisma.leaveRequest.create({
    data: { memberId: m.id, type: 'FULL_DAY', startDate: date, endDate: date, days: 1, status: 'REQUESTED' },
  });

  // Act
  const report = await individual(m.id);

  // Assert
  assert.equal(rowFor(report!.rows, day).sumMinutes, 0);
});
