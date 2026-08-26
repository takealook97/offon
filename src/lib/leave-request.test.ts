import test from 'node:test';
import assert from 'node:assert/strict';
import { availableLeaveDays, overlapRangeLabel } from './leave-request';

const balance = (base: number, bonus: number, used: number) => ({
  baseDays: base,
  bonusDays: bonus,
  usedDays: used,
});

test('what is left is the entitlement minus what is spent', () => {
  assert.equal(availableLeaveDays(balance(15, 0, 3), 0), 12);
  assert.equal(availableLeaveDays(balance(15, 2, 3), 0), 14);
});

test('requests still waiting are already spoken for', () => {
  // Those days are spoken for even before approval. Without subtracting them the same balance
  // funds two requests, both get approved, and it goes negative.
  assert.equal(availableLeaveDays(balance(15, 0, 3), 4), 8);
});

test('halves survive the arithmetic', () => {
  assert.equal(availableLeaveDays(balance(15, 0, 2.5), 0.5), 12);
});

test('someone with no balance row has nothing available', () => {
  // Just after seeding, or someone whose balance row does not exist yet. It has to be 0 for the request to be refused.
  assert.equal(availableLeaveDays(null, 0), 0);
});

test('an over-spent balance goes negative rather than clamping', () => {
  // Clamping to 0 loses by how much it is over, and the message shown uses that number.
  assert.equal(availableLeaveDays(balance(15, 0, 18), 0), -3);
});

test('a single-day overlap reads as one date', () => {
  assert.equal(
    overlapRangeLabel({
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2026-09-01T00:00:00Z'),
    }),
    '2026-09-01',
  );
});

test('a multi-day overlap reads as a range', () => {
  assert.equal(
    overlapRangeLabel({
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2026-09-03T00:00:00Z'),
    }),
    '2026-09-01~2026-09-03',
  );
});
