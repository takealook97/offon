import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import { runLeaveRollover } from './leave-rollover';

/**
 * This overwrites everyone's balance once a year. Getting it wrong takes a long time to notice
 * and hard to undo, so what is checked is less the rule than whether running it repeatedly changes anything.
 */

// 2026-01-05 is inside the rollover window, the first week of January. 2026-06-01 is outside it.
const IN_WINDOW = new Date('2026-01-05T03:00:00Z');
const OUT_OF_WINDOW = new Date('2026-06-01T03:00:00Z');

before(() => ensureSchema());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function giveBalance(
  memberId: number,
  values: { baseDays?: number; bonusDays?: number; usedDays?: number; rolloverYear: number },
) {
  return prisma.leaveBalance.create({
    data: {
      memberId,
      baseDays: values.baseDays ?? 15,
      bonusDays: values.bonusDays ?? 0,
      usedDays: values.usedDays ?? 0,
      rolloverYear: values.rolloverYear,
    },
  });
}

const asNumbers = (b: { baseDays: unknown; bonusDays: unknown; usedDays: unknown }) => ({
  base: Number(b.baseDays),
  bonus: Number(b.bonusDays),
  used: Number(b.usedDays),
});

test('outside the January window nothing is touched', async () => {
  const m = await createMember();
  await giveBalance(m.id, { baseDays: 15, usedDays: 9, rolloverYear: 2025 });

  const result = await runLeaveRollover(OUT_OF_WINDOW);
  assert.equal('skipped' in result && result.skipped, 'out_of_window');

  const row = await prisma.leaveBalance.findFirst({ where: { memberId: m.id } });
  assert.equal(Number(row!.usedDays), 9, 'a June run must not clear anyone');
});

test('a new year adds a day and clears what was used', async () => {
  const m = await createMember();
  await giveBalance(m.id, { baseDays: 15, bonusDays: 3, usedDays: 9, rolloverYear: 2025 });

  await runLeaveRollover(IN_WINDOW);

  const row = await prisma.leaveBalance.findFirst({ where: { memberId: m.id } });
  assert.deepEqual(asNumbers(row!), { base: 16, bonus: 0, used: 0 });
  assert.equal(row!.rolloverYear, 2026);
});

test('someone who joined mid-year rises to the standard entitlement', async () => {
  const m = await createMember();
  await giveBalance(m.id, { baseDays: 7.5, usedDays: 2, rolloverYear: 2025 });

  await runLeaveRollover(IN_WINDOW);

  const row = await prisma.leaveBalance.findFirst({ where: { memberId: m.id } });
  assert.equal(Number(row!.baseDays), 15);
});

test('running twice in the same week does not add twice', async () => {
  // A scheduler waking twice in the same week is not unusual. Applied twice, everyone gets an
  // extra day and a whole year passes with nobody the wiser.
  const m = await createMember();
  await giveBalance(m.id, { baseDays: 15, rolloverYear: 2025 });

  const first = await runLeaveRollover(IN_WINDOW);
  const second = await runLeaveRollover(IN_WINDOW);

  assert.equal('processed' in first && first.processed, 1);
  assert.equal('processed' in second && second.processed, 0, 'the second run finds nothing to do');

  const row = await prisma.leaveBalance.findFirst({ where: { memberId: m.id } });
  assert.equal(Number(row!.baseDays), 16);
});

test('someone already rolled over for this year is left alone', async () => {
  const m = await createMember();
  await giveBalance(m.id, { baseDays: 16, usedDays: 2, rolloverYear: 2026 });

  const result = await runLeaveRollover(IN_WINDOW);
  assert.equal('total' in result && result.total, 0);

  const row = await prisma.leaveBalance.findFirst({ where: { memberId: m.id } });
  assert.equal(Number(row!.usedDays), 2, 'their fresh year must not be wiped');
});

test('people who have left are skipped', async () => {
  const gone = await createMember('Departed');
  await giveBalance(gone.id, { baseDays: 15, usedDays: 5, rolloverYear: 2025 });
  await prisma.member.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

  const result = await runLeaveRollover(IN_WINDOW);
  assert.equal('total' in result && result.total, 0);

  const row = await prisma.leaveBalance.findFirst({ where: { memberId: gone.id } });
  assert.equal(Number(row!.usedDays), 5, 'a departed record stays as it was');
});

test('everyone is processed, and each gets an audit entry', async () => {
  const members = await Promise.all([createMember('A'), createMember('B'), createMember('C')]);
  for (const m of members) await giveBalance(m.id, { baseDays: 15, rolloverYear: 2025 });

  const result = await runLeaveRollover(IN_WINDOW);
  assert.equal('processed' in result && result.processed, 3);
  assert.equal('failed' in result && result.failed, 0);

  // Without an audit entry there is no way to check afterwards what went from what to what.
  assert.equal(await prisma.auditLog.count({ where: { action: 'LEAVE_ROLLOVER' } }), 3);
});

test('the audit entry records what the balance was before', async () => {
  const m = await createMember();
  await giveBalance(m.id, { baseDays: 15, bonusDays: 2, usedDays: 8, rolloverYear: 2025 });

  await runLeaveRollover(IN_WINDOW);

  const entry = await prisma.auditLog.findFirst({
    where: { action: 'LEAVE_ROLLOVER', target: String(m.id) },
  });
  const metadata = entry!.metadata as { before: { usedDays: string }; year: number };
  assert.equal(metadata.before.usedDays, '8');
  assert.equal(metadata.year, 2026);
});

test('the January window is judged in the organization timezone', async () => {
  // 2025-12-31T20:00Z is still last year in UTC but 05:00 on 1 January in Seoul, so it is inside the window.
  const m = await createMember();
  await giveBalance(m.id, { baseDays: 15, rolloverYear: 2025 });

  const result = await runLeaveRollover(new Date('2025-12-31T20:00:00Z'));
  assert.equal('processed' in result && result.processed, 1, 'Seoul is already in the new year');
});
