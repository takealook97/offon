import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import { GET as leaveRollover } from './leave-rollover/route';
import { GET as missingClockIn } from './missing-clockin/route';
import { GET as missingClockOut } from './missing-clockout/route';

/**
 * The HTTP surface of the scheduled jobs.
 *
 * The logic behind them is covered by their own db-tests. What is checked here is the door in
 * front: these are public URLs whose only authentication is one header, so if it is left open
 * anyone can reset everybody's leave or fire off chasing DMs.
 */

const SECRET = 'test-cron-secret';
const HANDLERS = [
  ['leave-rollover', leaveRollover],
  ['missing-clockin', missingClockIn],
  ['missing-clockout', missingClockOut],
] as const;

function request(path: string, authorization?: string): NextRequest {
  return new NextRequest(`http://localhost/api/cron/${path}`, {
    headers: authorization ? { authorization } : {},
  });
}

before(() => ensureSchema());
beforeEach(async () => {
  await resetDatabase();
  process.env.CRON_SECRET = SECRET;
});
after(async () => {
  delete process.env.CRON_SECRET;
  await prisma.$disconnect();
});

for (const [path, handler] of HANDLERS) {
  test(`${path} rejects a request with no token`, async () => {
    const res = await handler(request(path));
    assert.equal(res.status, 401);
  });

  test(`${path} rejects a wrong token`, async () => {
    const res = await handler(request(path, 'Bearer nope'));
    assert.equal(res.status, 401);
  });

  test(`${path} accepts the right token`, async () => {
    const res = await handler(request(path, `Bearer ${SECRET}`));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });

  test(`${path} fails closed when CRON_SECRET is unset`, async () => {
    // A deployment that forgot the secret must not leave these open. The 500 tells the caller
    // the configuration is wrong; it is not a way through.
    delete process.env.CRON_SECRET;
    const res = await handler(request(path, `Bearer ${SECRET}`));
    assert.equal(res.status, 500);
  });
}

test('an unauthorized rollover does not touch a single balance', async () => {
  // A status code alone cannot say whether the work had already been done before the refusal.
  const m = await createMember();
  await prisma.leaveBalance.create({
    data: { memberId: m.id, baseDays: 15, usedDays: 9, rolloverYear: 2025 },
  });

  await leaveRollover(request('leave-rollover', 'Bearer wrong'));

  const row = await prisma.leaveBalance.findFirst({ where: { memberId: m.id } });
  assert.equal(Number(row!.usedDays), 9);
  assert.equal(row!.rolloverYear, 2025);
});

test('an unauthorized reminder marks nobody', async () => {
  await createMember();

  await missingClockIn(request('missing-clockin', 'Bearer wrong'));

  assert.equal(await prisma.attendance.count(), 0);
});
