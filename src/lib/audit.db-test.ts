import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import { logAudit } from './audit';
import { countPendingApprovals } from './approvals';

/**
 * Two small modules that sit under everything else.
 *
 * The audit log is written on every path that changes something, and its one rule is that
 * failing to write must never take down the operation it was recording — approving leave and
 * then throwing because the log row would not insert is worse than losing the log line.
 *
 * The pending count is the badge in the nav. Its conditions have to match the list on the
 * approvals page, or the red dot shows and the page is empty.
 */

before(() => ensureSchema());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test('an audit line is written with its actor, action and target', async () => {
  // Arrange
  const m = await createMember();

  // Act
  await logAudit({ actorId: m.id, action: 'LEAVE_APPROVE', target: '42', metadata: { days: 1 } });

  // Assert
  const rows = await prisma.auditLog.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actorId, m.id);
  assert.equal(rows[0].action, 'LEAVE_APPROVE');
  assert.equal(rows[0].target, '42');
});

test('an action with no actor is still recorded', async () => {
  // Arrange: scheduled jobs and unknown-email sign-in attempts have nobody to attribute.
  // Act
  await logAudit({ action: 'LOGIN_UNKNOWN_EMAIL', metadata: { email: 'nobody@example.com' } });

  // Assert
  const rows = await prisma.auditLog.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actorId, null);
});

test('the trail is not bound to the member table', async () => {
  // Arrange: there is deliberately no foreign key on actorId, so a line survives the person
  // it names being purged. An audit trail that can be erased by deleting a row is not one.
  // Act
  await logAudit({ actorId: 999_999, action: 'LEAVE_APPROVE', target: '1' });

  // Assert
  const rows = await prisma.auditLog.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actorId, 999_999);
});

test('a write the database refuses does not throw at the caller', async () => {
  // Arrange: Postgres rejects a NUL byte in text and jsonb, and user-supplied strings reach
  // metadata. Losing the log line is the acceptable outcome; failing the approval that was
  // being recorded is not.
  const m = await createMember();

  // Act + Assert: the point is precisely that this resolves.
  await logAudit({
    actorId: m.id,
    action: 'LEAVE_APPROVE',
    target: '1',
    metadata: { reason: 'a\u0000b' },
  });

  assert.equal(await prisma.auditLog.count(), 0, 'nothing was written, and nothing broke');
});

test('nothing pending means nothing on the badge', async () => {
  // Act + Assert
  assert.equal(await countPendingApprovals(), 0);
});

test('the badge counts leave requests and corrections together', async () => {
  // Arrange
  const m = await createMember();
  const day = new Date('2026-06-01T00:00:00Z');
  await prisma.leaveRequest.create({
    data: { memberId: m.id, type: 'FULL_DAY', startDate: day, endDate: day, days: 1, status: 'REQUESTED' },
  });
  const attendance = await prisma.attendance.create({
    data: { memberId: m.id, workDate: day, status: 'DONE' },
  });
  const session = await prisma.attendanceSession.create({
    data: { attendanceId: attendance.id, startAt: day, endAt: day },
  });
  await prisma.attendanceEditRequest.create({
    data: {
      memberId: m.id,
      attendanceId: attendance.id,
      sessionId: session.id,
      status: 'REQUESTED',
      snapshot: {},
      proposed: {},
    },
  });

  // Act + Assert
  assert.equal(await countPendingApprovals(), 2);
});

test('anything already decided is off the badge', async () => {
  // Arrange
  const m = await createMember();
  const day = new Date('2026-06-01T00:00:00Z');
  for (const status of ['APPROVED', 'REJECTED', 'CANCELLED'] as const) {
    await prisma.leaveRequest.create({
      data: { memberId: m.id, type: 'FULL_DAY', startDate: day, endDate: day, days: 1, status },
    });
  }

  // Act + Assert
  assert.equal(await countPendingApprovals(), 0);
});

test('a soft-deleted request is off the badge too', async () => {
  // Arrange
  const m = await createMember();
  const day = new Date('2026-06-01T00:00:00Z');
  await prisma.leaveRequest.create({
    data: {
      memberId: m.id,
      type: 'FULL_DAY',
      startDate: day,
      endDate: day,
      days: 1,
      status: 'REQUESTED',
      deletedAt: new Date(),
    },
  });

  // Act + Assert
  assert.equal(await countPendingApprovals(), 0);
});
