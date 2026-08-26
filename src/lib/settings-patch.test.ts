import test from 'node:test';
import assert from 'node:assert/strict';
import { SettingsPatchBody } from './settings-patch';

const ok = (v: unknown) => SettingsPatchBody.safeParse(v).success;

const WORK = { workStartMinutes: 9 * 60, workEndMinutes: 18 * 60, mealMinutes: 60 };

// --- Shape ------------------------------------------------------------------

test('an empty patch is valid', () => {
  // The panel sends only what changed, so an empty body is a no-op, not an error.
  assert.equal(ok({}), true);
});

test('a patch that is not an object is rejected', () => {
  assert.equal(ok(null), false);
  assert.equal(ok('workStartMinutes=540'), false);
});

test('minute fields must be whole numbers inside a day', () => {
  assert.equal(ok({ workStartMinutes: -1 }), false);
  assert.equal(ok({ workStartMinutes: 9.5 }), false);
  assert.equal(ok({ workEndMinutes: 24 * 60 + 1 }), false);
  assert.equal(ok({ workEndMinutes: 24 * 60 }), true);
});

test('a meal must be a plausible break, not a shift', () => {
  // Under five minutes is a mis-click; over four hours is not a break but a
  // split shift, which this app does not model.
  assert.equal(ok({ mealMinutes: 4 }), false);
  assert.equal(ok({ mealMinutes: 5 }), true);
  assert.equal(ok({ mealMinutes: 240 }), true);
  assert.equal(ok({ mealMinutes: 241 }), false);
});

// --- Ordering ---------------------------------------------------------------

test('the working day must end after it starts', () => {
  assert.equal(ok({ ...WORK, workEndMinutes: 8 * 60 }), false);
});

test('a working day that starts and ends at the same time is rejected', () => {
  assert.equal(ok({ ...WORK, workEndMinutes: WORK.workStartMinutes }), false);
});

test('meeting room hours must close after they open', () => {
  assert.equal(ok({ roomOpenMinutes: 600, roomCloseMinutes: 540 }), false);
  assert.equal(ok({ roomOpenMinutes: 540, roomCloseMinutes: 600 }), true);
});

test('sending only one side of a pair is allowed', () => {
  // The stored value supplies the other half; comparing against it belongs to
  // the panel, not the schema.
  assert.equal(ok({ workStartMinutes: 9 * 60 }), true);
  assert.equal(ok({ roomCloseMinutes: 19 * 60 }), true);
});

// --- The meal has to fit inside the day -------------------------------------

test('a meal longer than the working day is rejected', () => {
  // Otherwise the standard day clamps to zero: every minute clocked becomes
  // overtime and a half day is worth nothing. It would look like a plausible
  // setting right up until the month-end totals.
  assert.equal(ok({ workStartMinutes: 9 * 60, workEndMinutes: 10 * 60, mealMinutes: 120 }), false);
});

test('a meal exactly as long as the working day is rejected', () => {
  assert.equal(ok({ workStartMinutes: 9 * 60, workEndMinutes: 10 * 60, mealMinutes: 60 }), false);
});

test('a meal one minute shorter than the day is allowed', () => {
  // Strange, but it leaves a real standard day behind, so the schema is not the
  // place to argue about it.
  assert.equal(ok({ workStartMinutes: 9 * 60, workEndMinutes: 10 * 60, mealMinutes: 59 }), true);
});

test('the default working hours pass', () => {
  assert.equal(ok(WORK), true);
});

// --- Notification toggles ---------------------------------------------------

test('the reminder toggles are booleans', () => {
  assert.equal(ok({ missingClockInNotifyEnabled: true }), true);
  assert.equal(ok({ missingClockOutNotifyEnabled: false }), true);
  assert.equal(ok({ missingClockInNotifyEnabled: 'yes' }), false);
});
