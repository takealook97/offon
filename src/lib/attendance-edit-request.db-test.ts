import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import { findPendingEditRequest, isPendingConflict } from './attendance-edit-request';
import { zonedToday } from './time';

/**
 * The two layers that keep a session to one correction at a time.
 *
 * The app looks for a pending request before creating one, and a partial unique index closes
 * the gap between that lookup and the create. Both are needed: the first gives a person
 * something to read, the second actually stops a double-click.
 *
 * The Prisma DSL cannot express a partial index, so these exist only as hand-written SQL and
 * vanish silently whenever migrations are regenerated from the schema — which has already
 * happened once. That is why what is checked here is the index's **behaviour**.
 */

const HOUR = 3_600_000;
const NOW = new Date('2026-08-26T10:00:00Z');
const at = (h: number) => new Date(NOW.getTime() + h * HOUR);

before(() => ensureSchema());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function aSession() {
  const member = await createMember();
  const attendance = await prisma.attendance.create({
    data: { memberId: member.id, workDate: zonedToday(), status: 'DONE' },
  });
  const session = await prisma.attendanceSession.create({
    data: { attendanceId: attendance.id, startAt: at(-4), endAt: at(-1) },
  });
  return { member, attendance, session };
}

type RequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

function requestData(
  ids: { memberId: number; attendanceId: number; sessionId: number },
  status: RequestStatus,
) {
  return {
    memberId: ids.memberId,
    attendanceId: ids.attendanceId,
    sessionId: ids.sessionId,
    status,
    snapshot: {},
    proposed: {},
  };
}

async function makeRequest(
  ids: { member: { id: number }; attendance: { id: number }; session: { id: number } },
  status: RequestStatus = 'REQUESTED',
) {
  return prisma.attendanceEditRequest.create({
    data: requestData(
      { memberId: ids.member.id, attendanceId: ids.attendance.id, sessionId: ids.session.id },
      status,
    ),
  });
}

// --- The lookup -------------------------------------------------------------

test('a session with nothing pending accepts a new request', async () => {
  const s = await aSession();
  assert.equal(await findPendingEditRequest(s.session.id), null);
});

test('a request still waiting blocks the next one', async () => {
  const s = await aSession();
  const first = await makeRequest(s);

  const found = await findPendingEditRequest(s.session.id);
  assert.equal(found?.id, first.id);
});

test('an approved request no longer blocks a new one', async () => {
  // Still blocking after approval would leave no way to fix an approval that was itself wrong.
  const s = await aSession();
  await makeRequest(s, 'APPROVED');

  assert.equal(await findPendingEditRequest(s.session.id), null);
});

test('a rejected request no longer blocks a new one', async () => {
  // A rejection means try again. Blocking on it turns a rejection into a permanent bar.
  const s = await aSession();
  await makeRequest(s, 'REJECTED');

  assert.equal(await findPendingEditRequest(s.session.id), null);
});

test('a soft-deleted pending request no longer blocks', async () => {
  const s = await aSession();
  const row = await makeRequest(s);
  await prisma.attendanceEditRequest.update({
    where: { id: row.id },
    data: { deletedAt: new Date() },
  });

  assert.equal(await findPendingEditRequest(s.session.id), null);
});

test('a pending request on another session does not block this one', async () => {
  // Dropping the sessionId condition would stop someone correcting any other date while one
  // correction is outstanding.
  const mine = await aSession();
  const other = await prisma.attendanceSession.create({
    data: { attendanceId: mine.attendance.id, startAt: at(1), endAt: at(3) },
  });
  await prisma.attendanceEditRequest.create({
    data: requestData(
      { memberId: mine.member.id, attendanceId: mine.attendance.id, sessionId: other.id },
      'REQUESTED',
    ),
  });

  assert.equal(await findPendingEditRequest(mine.session.id), null);
});

// --- Does the index actually stop the race ----------------------------------

test('the database refuses a second pending request for the same session', async () => {
  // Two requests from a double-click, both past the lookup, really are stopped here.
  const s = await aSession();
  await makeRequest(s);

  await assert.rejects(
    () => makeRequest(s),
    (err: unknown) => isPendingConflict(err),
  );
});

test('the same session may hold a pending request beside a settled one', async () => {
  // Without the index's WHERE clause this ordinary flow — rejected once, then requested
  // again — would be blocked.
  const s = await aSession();
  await makeRequest(s, 'REJECTED');
  await makeRequest(s, 'APPROVED');

  const again = await makeRequest(s);
  assert.equal((await findPendingEditRequest(s.session.id))?.id, again.id);
});

test('the database refuses a second open break on one session', async () => {
  // Pressing away twice opens two spans and coming back closes only one. The leftover keeps
  // the person away for good, unable even to request a correction.
  const s = await aSession();
  const open = {
    attendanceId: s.attendance.id,
    sessionId: s.session.id,
    startAt: at(-3),
    endAt: null,
  };
  await prisma.attendanceBreak.create({ data: open });

  await assert.rejects(() => prisma.attendanceBreak.create({ data: open }));
});

test('a session may hold many closed breaks', async () => {
  const s = await aSession();
  await prisma.attendanceBreak.create({
    data: {
      attendanceId: s.attendance.id,
      sessionId: s.session.id,
      startAt: at(-3),
      endAt: at(-2.5),
    },
  });
  await prisma.attendanceBreak.create({
    data: {
      attendanceId: s.attendance.id,
      sessionId: s.session.id,
      startAt: at(-2),
      endAt: at(-1.5),
    },
  });

  assert.equal(await prisma.attendanceBreak.count({ where: { sessionId: s.session.id } }), 2);
});

test('the database refuses a second open session on one day', async () => {
  // With two open, there is no telling which one a clock-out closes, and the totals go wrong.
  const s = await aSession();
  await prisma.attendanceSession.create({
    data: { attendanceId: s.attendance.id, startAt: at(0), endAt: null },
  });

  await assert.rejects(() =>
    prisma.attendanceSession.create({
      data: { attendanceId: s.attendance.id, startAt: at(1), endAt: null },
    }),
  );
});
