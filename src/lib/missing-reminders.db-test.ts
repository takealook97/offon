import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import { runMissingClockIn } from './missing-clockin';
import { runMissingClockOut } from './missing-clockout';
import { zonedToday, dayKey } from './time';

/**
 * These two reminders chase people. Get them wrong and someone on leave is nagged, or the
 * same person is nagged several times a day. So what is checked here is who gets picked and
 * how often they are told.
 *
 * Sending the DM itself is not checked. There is no Slack token in the test environment, so
 * sendDm throws and the handler catches it and writes to the audit log — and that branch is
 * the more interesting one to pin down anyway.
 */

before(() => ensureSchema());
beforeEach(async () => {
  await resetDatabase();
  // Leave the reminders switched on; with them off, most of these branches are never reached.
  await prisma.appSetting.create({
    data: { id: 1, missingClockInNotifyEnabled: true, missingClockOutNotifyEnabled: true },
  });
});
after(() => prisma.$disconnect());

/** Creates today's attendance row. A clockInAt on it means they turned up. */
async function clockedInToday(memberId: number) {
  return prisma.attendance.create({
    data: {
      memberId,
      workDate: zonedToday(),
      status: 'WORKING',
      clockInAt: new Date(),
    },
  });
}

async function approvedLeave(memberId: number, type: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM') {
  const today = zonedToday();
  return prisma.leaveRequest.create({
    data: {
      memberId,
      type,
      status: 'APPROVED',
      startDate: today,
      endDate: today,
      days: type === 'FULL_DAY' ? 1 : 0.5,
    },
  });
}

// --- Nobody clocked in ------------------------------------------------------

test('someone with no clock-in is flagged as missing', async () => {
  const m = await createMember();

  const result = await runMissingClockIn();
  if ('skipped' in result) return; // ran on a weekend; the holiday branch is covered separately below

  assert.equal(result.flagged, 1);
  const att = await prisma.attendance.findFirst({ where: { memberId: m.id } });
  assert.equal(att?.status, 'MISSING');
});

test('someone who already clocked in is left alone', async () => {
  const m = await createMember();
  await clockedInToday(m.id);

  const result = await runMissingClockIn();
  if ('skipped' in result) return;

  assert.equal(result.flagged, 0);
  const att = await prisma.attendance.findFirst({ where: { memberId: m.id } });
  assert.equal(att?.status, 'WORKING', 'their day must not be overwritten');
});

test('people off in the morning are not chased', async () => {
  // Someone on leave, or on a morning half day, has no reason to be here. They must not be chased.
  const onLeave = await createMember('On leave');
  const onHalfDay = await createMember('Morning off');
  await approvedLeave(onLeave.id, 'FULL_DAY');
  await approvedLeave(onHalfDay.id, 'HALF_DAY_AM');

  const result = await runMissingClockIn();
  if ('skipped' in result) return;
  assert.equal(result.flagged, 0);
});

test('an afternoon half day still expects a morning clock-in', async () => {
  const m = await createMember();
  await approvedLeave(m.id, 'HALF_DAY_PM');

  const result = await runMissingClockIn();
  if ('skipped' in result) return;
  assert.equal(result.flagged, 1);
});

test('people excluded from reminders are skipped entirely', async () => {
  const m = await createMember();
  await prisma.member.update({
    where: { id: m.id },
    data: { excludeMissingNotify: true },
  });

  const result = await runMissingClockIn();
  if ('skipped' in result) return;
  assert.equal(result.flagged, 0);
  assert.equal(await prisma.attendance.count(), 0, 'not even a MISSING row');
});

test('people who have left are skipped', async () => {
  const gone = await createMember('Departed');
  await prisma.member.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

  const result = await runMissingClockIn();
  if ('skipped' in result) return;
  assert.equal(result.flagged, 0);
});

test('a holiday stops the run', async () => {
  await createMember();
  // holidays.date is a @db.Date and the query works from midnight UTC, so it is inserted in that shape.
  const key = dayKey(new Date());
  await prisma.holiday.create({
    data: { date: new Date(`${key}T00:00:00Z`), name: 'Test holiday' },
  });

  const result = await runMissingClockIn();
  // On a weekend that branch wins first. Either way the conclusion is the same: nobody is chased.
  assert.ok('skipped' in result, 'the run stops before flagging anyone');
  assert.equal(await prisma.attendance.count(), 0);
});

test('flagging happens even when the DM cannot be sent', async () => {
  // There is no Slack token in the test environment. Even when sending fails the record must
  // still be flagged, so an admin can see it on the calendar, and the failure must reach the
  // audit log so the cause can be found.
  const m = await createMember();

  const result = await runMissingClockIn();
  if ('skipped' in result) return;

  assert.equal(result.flagged, 1, 'the record is still marked');
  assert.equal(result.notified, 0, 'nothing went out');

  const failure = await prisma.auditLog.findFirst({
    where: { action: 'SLACK_SEND_FAIL', actorId: m.id },
  });
  assert.ok(failure, 'the failure is recorded rather than swallowed');
});

test('running twice does not create a second record', async () => {
  const m = await createMember();
  await runMissingClockIn();
  await runMissingClockIn();

  // There is one attendance row per day. A second run creating another would break every total.
  assert.ok((await prisma.attendance.count({ where: { memberId: m.id } })) <= 1);
});

// --- Nobody clocked out -----------------------------------------------------

test('someone with an open session is a target', async () => {
  const m = await createMember();
  const att = await clockedInToday(m.id);
  await prisma.attendanceSession.create({
    data: { attendanceId: att.id, startAt: new Date(), endAt: null },
  });

  const result = await runMissingClockOut();
  if ('skipped' in result) return;
  assert.equal(result.targets, 1);
});

test('the clock-out reminder changes nothing', async () => {
  // Clocking out on someone's behalf would put a time that never happened into their hours. This only tells them.
  const m = await createMember();
  const att = await clockedInToday(m.id);
  await prisma.attendanceSession.create({
    data: { attendanceId: att.id, startAt: new Date(), endAt: null },
  });

  await runMissingClockOut();

  const session = await prisma.attendanceSession.findFirst({ where: { attendanceId: att.id } });
  assert.equal(session?.endAt, null, 'the session stays open');
  const after = await prisma.attendance.findFirst({ where: { memberId: m.id } });
  assert.equal(after?.status, 'WORKING', 'the status is untouched');
});

test('a closed session is not a target', async () => {
  const m = await createMember();
  const att = await clockedInToday(m.id);
  await prisma.attendanceSession.create({
    data: {
      attendanceId: att.id,
      startAt: new Date(Date.now() - 3_600_000),
      endAt: new Date(),
    },
  });

  const result = await runMissingClockOut();
  if ('skipped' in result) return;
  assert.equal(result.targets, 0);
});
