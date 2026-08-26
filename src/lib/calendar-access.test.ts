import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCalendarTarget } from './calendar-access';

const ME = { memberId: 7, role: 'EMPLOYEE' };
const ADMIN = { memberId: 1, role: 'ADMIN' };

test('no memberId means my own calendar', () => {
  assert.deepEqual(resolveCalendarTarget(null, ME), { ok: true, memberId: 7 });
});

test('my own memberId is fine', () => {
  assert.deepEqual(resolveCalendarTarget('7', ME), { ok: true, memberId: 7 });
});

test('someone else calendar is refused', () => {
  // Only an admin sees another person's hours and leave.
  assert.deepEqual(resolveCalendarTarget('8', ME), { ok: false, reason: 'forbidden' });
});

test('an admin may look at anyone', () => {
  assert.deepEqual(resolveCalendarTarget('8', ADMIN), { ok: true, memberId: 8 });
});

for (const junk of ['abc', '', '0', '-3', '1.5', 'NaN', 'Infinity']) {
  test(`a memberId of "${junk}" falls back to my own calendar`, () => {
    // Someone who pasted a link wrong gets their own calendar rather than an error. What
    // matters is that it never falls towards **somebody else's**.
    assert.deepEqual(resolveCalendarTarget(junk, ME), { ok: true, memberId: 7 });
  });
}

test('a junk memberId does not hand an admin someone else calendar either', () => {
  assert.deepEqual(resolveCalendarTarget('abc', ADMIN), { ok: true, memberId: 1 });
});

test('a numeric string with whitespace still resolves to that member', () => {
  // Number(' 8 ') is 8. An admin gets through; anyone else still has to be refused.
  assert.deepEqual(resolveCalendarTarget(' 8 ', ADMIN), { ok: true, memberId: 8 });
  assert.deepEqual(resolveCalendarTarget(' 8 ', ME), { ok: false, reason: 'forbidden' });
});
