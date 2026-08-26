import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import { applyAttendanceEditApproval } from './attendance-edit-approval';
import { zonedToday } from './time';

/**
 * One approval overwrites somebody's recorded hours.
 *
 * All three refusals exist to stop data being quietly corrupted. Without them an approval
 * writes to a session that is gone, or removes a break in progress and leaves someone able neither
 * to come back nor to clock out, or silently overwrites a change made since. Without tests the next person
 * looks at these checks, wonders why they are there, and deletes them.
 */

const HOUR = 3_600_000;
const NOW = new Date('2026-08-26T10:00:00Z');
const at = (h: number) => new Date(NOW.getTime() + h * HOUR).toISOString();

before(() => ensureSchema());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

/** Builds a day holding one session, clocked in and out. */
async function aDayWithSession(startHours = -4, endHours: number | null = -1) {
  const m = await createMember();
  const attendance = await prisma.attendance.create({
    data: {
      memberId: m.id,
      workDate: zonedToday(),
      status: endHours === null ? 'WORKING' : 'DONE',
    },
  });
  const session = await prisma.attendanceSession.create({
    data: {
      attendanceId: attendance.id,
      startAt: new Date(at(startHours)),
      endAt: endHours === null ? null : new Date(at(endHours)),
    },
  });
  return { member: m, attendance, session };
}

function timeline(startHours: number, endHours: number | null, breaks: [number, number][] = []) {
  return {
    startAt: at(startHours),
    endAt: endHours === null ? null : at(endHours),
    breaks: breaks.map(([s, e]) => ({ startAt: at(s), endAt: at(e), kind: 'BREAK' })),
  };
}

async function editRequest(
  ids: { attendanceId: number; sessionId: number; memberId: number },
  snapshot: unknown,
  proposed: unknown,
) {
  return prisma.attendanceEditRequest.create({
    data: {
      attendanceId: ids.attendanceId,
      sessionId: ids.sessionId,
      memberId: ids.memberId,
      status: 'REQUESTED',
      snapshot: snapshot as object,
      proposed: proposed as object,
    },
  });
}

const asTarget = (
  req: { id: number; snapshot: unknown; proposed: unknown },
  sessionId: number,
  attendanceId: number,
) => ({ id: req.id, sessionId, attendanceId, snapshot: req.snapshot, proposed: req.proposed });

test('a straightforward correction is written to the session', async () => {
  const { member, attendance, session } = await aDayWithSession(-4, -1);
  const req = await editRequest(
    { attendanceId: attendance.id, sessionId: session.id, memberId: member.id },
    timeline(-4, -1),
    timeline(-4, -2), // moves the clock-out an hour earlier
  );

  const outcome = await applyAttendanceEditApproval(
    asTarget(req, session.id, attendance.id),
    member.id,
    NOW,
  );

  assert.ok(!('code' in outcome), 'the approval went through');
  const after = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: session.id } });
  assert.equal(after.endAt?.toISOString(), at(-2));
});

test('approving recomputes the daily totals', async () => {
  // Correcting the session without the totals leaves the hours on screen disagreeing with the record.
  const { member, attendance, session } = await aDayWithSession(-4, -1);
  const req = await editRequest(
    { attendanceId: attendance.id, sessionId: session.id, memberId: member.id },
    timeline(-4, -1),
    timeline(-4, -2),
  );

  await applyAttendanceEditApproval(asTarget(req, session.id, attendance.id), member.id, NOW);

  const after = await prisma.attendance.findUniqueOrThrow({ where: { id: attendance.id } });
  assert.equal(after.workedMinutes, 120, 'four hours minus the hour that was trimmed');
  assert.equal(after.status, 'DONE');
});

test('the request is marked approved with who approved it', async () => {
  const { member, attendance, session } = await aDayWithSession();
  const admin = await createMember('Admin');
  const req = await editRequest(
    { attendanceId: attendance.id, sessionId: session.id, memberId: member.id },
    timeline(-4, -1),
    timeline(-4, -2),
  );

  await applyAttendanceEditApproval(asTarget(req, session.id, attendance.id), admin.id, NOW);

  const after = await prisma.attendanceEditRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(after.status, 'APPROVED');
  assert.equal(after.approverId, admin.id);
});

test('a session deleted since the request is refused', async () => {
  const { member, attendance, session } = await aDayWithSession();
  const req = await editRequest(
    { attendanceId: attendance.id, sessionId: session.id, memberId: member.id },
    timeline(-4, -1),
    timeline(-4, -2),
  );
  await prisma.attendanceSession.update({
    where: { id: session.id },
    data: { deletedAt: new Date() },
  });

  const outcome = await applyAttendanceEditApproval(
    asTarget(req, session.id, attendance.id),
    member.id,
    NOW,
  );

  assert.equal('code' in outcome && outcome.code, 'NOT_FOUND');
});

test('an open break blocks approval', async () => {
  // Approving anyway soft-deletes the open break and leaves the status at ON_BREAK, trapping
  // the person: they can neither come back nor clock out.
  const { member, attendance, session } = await aDayWithSession(-4, null);
  await prisma.attendanceBreak.create({
    data: {
      attendanceId: attendance.id,
      sessionId: session.id,
      startAt: new Date(at(-1)),
      endAt: null,
      kind: 'BREAK',
    },
  });
  const req = await editRequest(
    { attendanceId: attendance.id, sessionId: session.id, memberId: member.id },
    timeline(-4, null),
    timeline(-5, null),
  );

  const outcome = await applyAttendanceEditApproval(
    asTarget(req, session.id, attendance.id),
    member.id,
    NOW,
  );

  assert.equal('code' in outcome && outcome.code, 'OPEN_BREAK');
  const stillOpen = await prisma.attendanceBreak.findFirst({
    where: { sessionId: session.id, deletedAt: null },
  });
  assert.equal(stillOpen?.endAt, null, 'the running break survives the refusal');
});

test('a change made after the request blocks approval instead of overwriting it', async () => {
  // The person changed the same field themselves after requesting. Picking a winner
  // automatically would silently discard one of the two corrections.
  const { member, attendance, session } = await aDayWithSession(-4, -1);
  const req = await editRequest(
    { attendanceId: attendance.id, sessionId: session.id, memberId: member.id },
    timeline(-4, -1), // how it looked when the request was made
    timeline(-4, -2), // what was requested
  );
  await prisma.attendanceSession.update({
    where: { id: session.id },
    data: { endAt: new Date(at(-3)) },
  });

  const outcome = await applyAttendanceEditApproval(
    asTarget(req, session.id, attendance.id),
    member.id,
    NOW,
  );

  assert.equal('code' in outcome && outcome.code, 'DRIFT');
  const after = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: session.id } });
  assert.equal(after.endAt?.toISOString(), at(-3), 'the later change stands');
});

test('a refused approval leaves the request open for another look', async () => {
  const { member, attendance, session } = await aDayWithSession(-4, -1);
  const req = await editRequest(
    { attendanceId: attendance.id, sessionId: session.id, memberId: member.id },
    timeline(-4, -1),
    timeline(-4, -2),
  );
  await prisma.attendanceSession.update({
    where: { id: session.id },
    data: { endAt: new Date(at(-3)) },
  });

  await applyAttendanceEditApproval(asTarget(req, session.id, attendance.id), member.id, NOW);

  const after = await prisma.attendanceEditRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(after.status, 'REQUESTED', 'it was not silently consumed');
});

test('breaks are rewritten to match what was approved', async () => {
  const { member, attendance, session } = await aDayWithSession(-6, -1);
  await prisma.attendanceBreak.create({
    data: {
      attendanceId: attendance.id,
      sessionId: session.id,
      startAt: new Date(at(-5)),
      endAt: new Date(at(-4)),
      kind: 'BREAK',
    },
  });
  const req = await editRequest(
    { attendanceId: attendance.id, sessionId: session.id, memberId: member.id },
    timeline(-6, -1, [[-5, -4]]),
    timeline(-6, -1, [[-3, -2]]), // moves the break
  );

  const outcome = await applyAttendanceEditApproval(
    asTarget(req, session.id, attendance.id),
    member.id,
    NOW,
  );
  assert.ok(!('code' in outcome));

  const live = await prisma.attendanceBreak.findMany({
    where: { sessionId: session.id, deletedAt: null },
  });
  assert.equal(live.length, 1, 'the old row is replaced, not added to');
  assert.equal(live[0].startAt.toISOString(), at(-3));
});
