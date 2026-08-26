import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import { applyLeaveApproval, applyLeaveCancellation } from './leave-balance';

/**
 * This arithmetic is somebody's leave. Subtracting too much on approval loses days they
 * never took; returning too little on cancellation loses them just the same. Neither is easy
 * to notice from the screen.
 */

before(() => ensureSchema());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function memberWithBalance(used = 0, base = 15) {
  const m = await createMember();
  await prisma.leaveBalance.create({
    data: { memberId: m.id, baseDays: base, usedDays: used, rolloverYear: 2026 },
  });
  return m;
}

async function pendingRequest(memberId: number, days: number) {
  const start = new Date('2026-09-01T00:00:00Z');
  return prisma.leaveRequest.create({
    data: {
      memberId,
      type: days === 0.5 ? 'HALF_DAY_AM' : 'FULL_DAY',
      status: 'REQUESTED',
      startDate: start,
      endDate: start,
      days,
    },
  });
}

const usedDaysOf = async (memberId: number) =>
  Number((await prisma.leaveBalance.findFirstOrThrow({ where: { memberId } })).usedDays);

test('approving deducts exactly the recomputed days', async () => {
  const m = await memberWithBalance(2);
  const req = await pendingRequest(m.id, 3);

  await applyLeaveApproval(req.id, m.id, new Prisma.Decimal(3));

  assert.equal(await usedDaysOf(m.id), 5);
});

test('approving stores the recomputed days, not what was requested', async () => {
  // When a holiday appears after the request, the count recomputed at approval is what has to
  // be stored. Keeping the requested figure records a day off that was never taken.
  const m = await memberWithBalance();
  const req = await pendingRequest(m.id, 5);

  await applyLeaveApproval(req.id, m.id, new Prisma.Decimal(4));

  const after = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(Number(after.days), 4);
  assert.equal(await usedDaysOf(m.id), 4);
});

test('approving records who approved it', async () => {
  const requester = await memberWithBalance();
  const admin = await createMember('Admin');
  const req = await pendingRequest(requester.id, 1);

  await applyLeaveApproval(req.id, admin.id, new Prisma.Decimal(1));

  const after = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(after.approverId, admin.id);
  assert.equal(after.status, 'APPROVED');
});

test('half days move the balance by a half', async () => {
  const m = await memberWithBalance(1);
  const req = await pendingRequest(m.id, 0.5);

  await applyLeaveApproval(req.id, m.id, new Prisma.Decimal(0.5));

  assert.equal(await usedDaysOf(m.id), 1.5);
});

test('cancelling approved leave gives the days back', async () => {
  const m = await memberWithBalance();
  const req = await pendingRequest(m.id, 3);
  await applyLeaveApproval(req.id, m.id, new Prisma.Decimal(3));
  assert.equal(await usedDaysOf(m.id), 3);

  const result = await applyLeaveCancellation(req.id);

  assert.equal(result.restored, true);
  assert.equal(await usedDaysOf(m.id), 0);
});

test('cancelling a request that was never approved gives nothing back', async () => {
  // A pending request was never deducted. Reversing it here would hand out leave nobody spent.
  const m = await memberWithBalance(4);
  const req = await pendingRequest(m.id, 2);

  const result = await applyLeaveCancellation(req.id);

  assert.equal(result.restored, false);
  assert.equal(result.previousStatus, 'REQUESTED');
  assert.equal(await usedDaysOf(m.id), 4, 'their balance is untouched');
});

test('approve then cancel leaves the balance exactly where it started', async () => {
  const m = await memberWithBalance(6);
  const req = await pendingRequest(m.id, 2.5);

  await applyLeaveApproval(req.id, m.id, new Prisma.Decimal(2.5));
  await applyLeaveCancellation(req.id);

  assert.equal(await usedDaysOf(m.id), 6);
});

test('cancelling marks the request cancelled', async () => {
  const m = await memberWithBalance();
  const req = await pendingRequest(m.id, 1);

  await applyLeaveCancellation(req.id);

  const after = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(after.status, 'CANCELLED');
});

test('a failed balance update rolls the approval back', async () => {
  // Someone with no balance row. Leaving the status at APPROVED with nothing deducted lets an
  // approved request drift out of step with the balance, quietly.
  const m = await createMember();
  const req = await pendingRequest(m.id, 1);

  await assert.rejects(() => applyLeaveApproval(req.id, m.id, new Prisma.Decimal(1)));

  const after = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(after.status, 'REQUESTED', 'the approval did not stick');
});
