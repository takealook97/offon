import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import {
  clockInMember,
  clockOutMember,
  startBreak,
  endBreak,
  startLunch,
} from './attendance';

/**
 * The attendance state machine cannot be checked with pure functions: the unique index on an open session,
 * the row locks inside transactions and the re-entry guards all rest on database constraints.
 */

before(() => ensureSchema());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test('clocking in twice is refused rather than opening a second session', async () => {
  const m = await createMember();
  assert.equal((await clockInMember(m.id, 'web')).ok, true);

  const again = await clockInMember(m.id, 'web');
  assert.equal(again.ok, false);
  assert.equal(again.ok === false && again.code, 'ALREADY_WORKING');

  // A second one quietly succeeding leaves two sessions and counts the hours twice.
  assert.equal(await prisma.attendanceSession.count({ where: { endAt: null } }), 1);
});

test('clocking out without clocking in is refused', async () => {
  const m = await createMember();
  const result = await clockOutMember(m.id, 'web');
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, 'NO_OPEN_SESSION');
});

test('you cannot clock out while away', async () => {
  const m = await createMember();
  await clockInMember(m.id, 'web');
  await startBreak(m.id, 'web');

  const result = await clockOutMember(m.id, 'web');
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, 'ON_BREAK');
});

test('coming back from a break closes it and returns to working', async () => {
  const m = await createMember();
  await clockInMember(m.id, 'web');
  await startBreak(m.id, 'web');
  assert.equal((await endBreak(m.id, 'web')).ok, true);

  assert.equal(await prisma.attendanceBreak.count({ where: { endAt: null } }), 0);
  const attendance = await prisma.attendance.findFirst({ where: { memberId: m.id } });
  assert.equal(attendance?.status, 'WORKING');
});

test('a second break while already away is refused', async () => {
  const m = await createMember();
  await clockInMember(m.id, 'web');
  await startBreak(m.id, 'web');

  const again = await startBreak(m.id, 'web');
  assert.equal(again.ok, false);
  assert.equal(again.ok === false && again.code, 'ALREADY_ON_BREAK');
  assert.equal(await prisma.attendanceBreak.count({ where: { endAt: null } }), 1);
});

test('a meal is stored closed, an hour long, with no return to make', async () => {
  const m = await createMember();
  await clockInMember(m.id, 'web');
  assert.equal((await startLunch(m.id, 'web')).ok, true);

  const meal = await prisma.attendanceBreak.findFirst({ where: { kind: 'LUNCH' } });
  assert.ok(meal?.endAt, 'a meal is written with its end already set');
  const minutes = Math.round((meal.endAt.getTime() - meal.startAt.getTime()) / 60_000);
  assert.equal(minutes, 60);
});

test('a meal takes its length from settings, not a constant', async () => {
  await prisma.appSetting.upsert({
    where: { id: 1 },
    create: { id: 1, mealMinutes: 45 },
    update: { mealMinutes: 45 },
  });
  const m = await createMember();
  await clockInMember(m.id, 'web');
  await startLunch(m.id, 'web');

  const meal = await prisma.attendanceBreak.findFirst({ where: { kind: 'LUNCH' } });
  const minutes = Math.round((meal!.endAt!.getTime() - meal!.startAt.getTime()) / 60_000);
  assert.equal(minutes, 45);
});

test('a second meal while one is running is refused', async () => {
  const m = await createMember();
  await clockInMember(m.id, 'web');
  await startLunch(m.id, 'web');

  const again = await startLunch(m.id, 'web');
  assert.equal(again.ok, false);
  assert.equal(again.ok === false && again.code, 'ON_LUNCH');
  // Two of them deduct an extra hour from the worked time and send two return notices.
  assert.equal(await prisma.attendanceBreak.count({ where: { kind: 'LUNCH' } }), 1);
});

test('concurrent clock-ins still open exactly one session', async () => {
  // A double-click, a second tab, the web and Slack at once. A check beforehand cannot stop any of them, so
  // this confirms the unique index and the transaction are really in place.
  const m = await createMember();
  const results = await Promise.all([
    clockInMember(m.id, 'web'),
    clockInMember(m.id, 'slack'),
    clockInMember(m.id, 'web'),
  ]);

  assert.equal(results.filter((r) => r.ok).length, 1, 'exactly one should win');
  assert.equal(await prisma.attendanceSession.count({ where: { endAt: null } }), 1);
});

test('concurrent meals still record exactly one', async () => {
  const m = await createMember();
  await clockInMember(m.id, 'web');
  await Promise.all([startLunch(m.id, 'web'), startLunch(m.id, 'slack')]);

  assert.equal(await prisma.attendanceBreak.count({ where: { kind: 'LUNCH' } }), 1);
});
