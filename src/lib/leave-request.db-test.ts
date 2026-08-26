import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import { findOverlappingLeave, remainingLeaveFor } from './leave-request';

/**
 * The overlap check is nothing but query conditions, so no pure function can pin it down.
 * Miss a clash and two requests are approved for one day, taking it out of the balance
 * twice; catch too much and a cancelled date can never be used again.
 */

before(() => ensureSchema());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

const d = (day: number) => new Date(`2026-09-${String(day).padStart(2, '0')}T00:00:00Z`);
const key = (day: number) => `2026-09-${String(day).padStart(2, '0')}`;

async function leave(
  memberId: number,
  fromDay: number,
  toDay: number,
  status: 'REQUESTED' | 'APPROVED' | 'CANCELLED' | 'REJECTED',
  days = 1,
) {
  return prisma.leaveRequest.create({
    data: { memberId, type: 'FULL_DAY', status, startDate: d(fromDay), endDate: d(toDay), days },
  });
}

// --- Overlap ----------------------------------------------------------------

test('the same day is an overlap', async () => {
  const m = await createMember();
  await leave(m.id, 10, 10, 'APPROVED');

  assert.ok(await findOverlappingLeave(m.id, key(10), key(10)));
});

test('a range that swallows an existing one overlaps', async () => {
  const m = await createMember();
  await leave(m.id, 10, 11, 'APPROVED', 2);

  assert.ok(await findOverlappingLeave(m.id, key(8), key(14)));
});

test('touching only at the edge still overlaps', async () => {
  // With 09-10 to 09-12 held, requesting 09-12 to 09-14 shares the 12th. The comparison has to be inclusive.
  const m = await createMember();
  await leave(m.id, 10, 12, 'APPROVED', 3);

  assert.ok(await findOverlappingLeave(m.id, key(12), key(14)));
});

test('the day after does not overlap', async () => {
  const m = await createMember();
  await leave(m.id, 10, 12, 'APPROVED', 3);

  assert.equal(await findOverlappingLeave(m.id, key(13), key(14)), null);
});

test('a pending request already holds its dates', async () => {
  // The date is held even before approval; otherwise two requests pile up on it.
  const m = await createMember();
  await leave(m.id, 10, 10, 'REQUESTED');

  assert.ok(await findOverlappingLeave(m.id, key(10), key(10)));
});

test('cancelled and rejected requests free their dates', async () => {
  const m = await createMember();
  await leave(m.id, 10, 10, 'CANCELLED');
  await leave(m.id, 11, 11, 'REJECTED');

  assert.equal(await findOverlappingLeave(m.id, key(10), key(11)), null);
});

test('a soft-deleted request frees its dates', async () => {
  const m = await createMember();
  const row = await leave(m.id, 10, 10, 'APPROVED');
  await prisma.leaveRequest.update({
    where: { id: row.id },
    data: { deletedAt: new Date() },
  });

  assert.equal(await findOverlappingLeave(m.id, key(10), key(10)), null);
});

test('someone else booking the same day is not an overlap', async () => {
  const mine = await createMember('Mine');
  const theirs = await createMember('Theirs');
  await leave(theirs.id, 10, 10, 'APPROVED');

  assert.equal(await findOverlappingLeave(mine.id, key(10), key(10)), null);
});

// --- What is left -----------------------------------------------------------

test('remaining subtracts what is used and what is waiting', async () => {
  const m = await createMember();
  await prisma.leaveBalance.create({
    data: { memberId: m.id, baseDays: 15, bonusDays: 1, usedDays: 4, rolloverYear: 2026 },
  });
  await leave(m.id, 20, 21, 'REQUESTED', 2);

  assert.equal(await remainingLeaveFor(m.id), 10); // 15 + 1 - 4 - 2
});

test('approved leave is counted through usedDays, not twice', async () => {
  // Approval moves it into usedDays. Counting it in the pending total as well takes the same day out twice.
  const m = await createMember();
  await prisma.leaveBalance.create({
    data: { memberId: m.id, baseDays: 15, usedDays: 3, rolloverYear: 2026 },
  });
  await leave(m.id, 20, 22, 'APPROVED', 3);

  assert.equal(await remainingLeaveFor(m.id), 12);
});

test('someone with no balance row has nothing to spend', async () => {
  const m = await createMember();
  assert.equal(await remainingLeaveFor(m.id), 0);
});
