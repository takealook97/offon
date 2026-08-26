import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MEAL_POLICY,
  buildAndValidateTimeline,
  mergeAttendanceEditTimeline,
  type EditTimeline,
} from './attendance-edit';

const timeline = (
  startAt: string,
  endAt: string | null,
  breaks: EditTimeline['breaks'] = [],
): EditTimeline => ({ startAt, endAt, breaks });

const breakAt = (
  startAt: string,
  endAt: string,
  kind: 'BREAK' | 'LUNCH' = 'BREAK',
): EditTimeline['breaks'][number] => ({ startAt, endAt, kind });

test('a clock-out recorded after the request was made is kept', () => {
  const base = timeline('2026-07-25T01:41:45.274Z', null);
  const proposed = timeline('2026-07-25T01:19:00.000Z', null);
  const live = timeline('2026-07-25T01:41:45.274Z', '2026-07-25T02:31:55.593Z');

  const result = mergeAttendanceEditTimeline(base, proposed, live);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.timeline.startAt, proposed.startAt);
  assert.equal(result.timeline.endAt, live.endAt);
});

test('a request that left breaks alone keeps every meal and break added since', () => {
  const base = timeline('2026-07-25T01:00:00.000Z', null);
  const proposed = timeline('2026-07-25T00:50:00.000Z', null);
  const live = timeline('2026-07-25T01:00:00.000Z', '2026-07-25T09:00:00.000Z', [
    breakAt('2026-07-25T03:00:00.000Z', '2026-07-25T04:00:00.000Z', 'LUNCH'),
    breakAt('2026-07-25T06:00:00.000Z', '2026-07-25T06:10:00.000Z'),
  ]);

  const result = mergeAttendanceEditTimeline(base, proposed, live);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.timeline.breaks, live.breaks);
  assert.equal(result.timeline.endAt, live.endAt);
});

test('an edited break and one added since the request merge together', () => {
  const original = breakAt('2026-07-25T03:00:00.000Z', '2026-07-25T03:20:00.000Z');
  const edited = breakAt('2026-07-25T03:05:00.000Z', '2026-07-25T03:15:00.000Z');
  const laterLunch = breakAt(
    '2026-07-25T04:00:00.000Z',
    '2026-07-25T05:00:00.000Z',
    'LUNCH',
  );
  const base = timeline('2026-07-25T01:00:00.000Z', null, [original]);
  const proposed = timeline('2026-07-25T01:00:00.000Z', null, [edited]);
  const live = timeline('2026-07-25T01:00:00.000Z', null, [original, laterLunch]);

  const result = mergeAttendanceEditTimeline(base, proposed, live);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.timeline.breaks, [edited, laterLunch]);
});

test('the same new break on both sides is kept once, not twice', () => {
  const added = breakAt('2026-07-25T03:00:00.000Z', '2026-07-25T03:10:00.000Z');
  const base = timeline('2026-07-25T01:00:00.000Z', null);
  const proposed = timeline('2026-07-25T01:00:00.000Z', null, [added]);
  const live = timeline('2026-07-25T01:00:00.000Z', null, [added]);

  const result = mergeAttendanceEditTimeline(base, proposed, live);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.timeline.breaks, [added]);
});

test('the same break edited differently on both sides is a conflict', () => {
  const original = breakAt('2026-07-25T03:00:00.000Z', '2026-07-25T03:20:00.000Z');
  const requested = breakAt('2026-07-25T03:05:00.000Z', '2026-07-25T03:15:00.000Z');
  const liveEdited = breakAt('2026-07-25T03:00:00.000Z', '2026-07-25T03:30:00.000Z');
  const base = timeline('2026-07-25T01:00:00.000Z', null, [original]);
  const proposed = timeline('2026-07-25T01:00:00.000Z', null, [requested]);
  const live = timeline('2026-07-25T01:00:00.000Z', null, [liveEdited]);

  const result = mergeAttendanceEditTimeline(base, proposed, live);

  assert.deepEqual(result, { ok: false, conflicts: ['breaks'] });
});

test('breaks that overlap once merged are a conflict', () => {
  const requested = breakAt('2026-07-25T03:00:00.000Z', '2026-07-25T03:30:00.000Z');
  const liveAdded = breakAt('2026-07-25T03:20:00.000Z', '2026-07-25T03:40:00.000Z');
  const base = timeline('2026-07-25T01:00:00.000Z', null);
  const proposed = timeline('2026-07-25T01:00:00.000Z', null, [requested]);
  const live = timeline('2026-07-25T01:00:00.000Z', null, [liveAdded]);

  const result = mergeAttendanceEditTimeline(base, proposed, live);

  assert.deepEqual(result, { ok: false, conflicts: ['range'] });
});

test('a clock-out changed differently on both sides is a conflict', () => {
  const base = timeline(
    '2026-07-25T01:00:00.000Z',
    '2026-07-25T09:00:00.000Z',
  );
  const proposed = timeline(
    '2026-07-25T01:00:00.000Z',
    '2026-07-25T08:50:00.000Z',
  );
  const live = timeline(
    '2026-07-25T01:00:00.000Z',
    '2026-07-25T09:10:00.000Z',
  );

  const result = mergeAttendanceEditTimeline(base, proposed, live);

  assert.deepEqual(result, { ok: false, conflicts: ['endAt'] });
});

// --- The meal-length policy -------------------------------------------------

/** The smallest input for a day, carrying one meal of the given length. */
function dayWithMeal(mealStart: string, mealEnd: string) {
  return {
    clockIn: '2026-07-25T09:00',
    clockOut: '2026-07-25T18:00',
    breaks: [{ start: mealStart, end: mealEnd, kind: 'LUNCH' as const }],
  };
}

function mealMinutesOf(result: ReturnType<typeof buildAndValidateTimeline>): number {
  assert.ok(result.ok, 'expected the timeline to validate');
  const b = result.timeline.breaks[0];
  return Math.round(
    (new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 60_000,
  );
}

const NOW = new Date('2026-07-25T23:00:00Z');

test('a new meal takes the current setting, whatever the client sent', () => {
  // Even when the client sends 90 minutes, the server decides from the setting.
  const result = buildAndValidateTimeline(
    dayWithMeal('2026-07-25T12:00', '2026-07-25T13:30'),
    NOW,
    { current: 45, allowed: [] },
  );
  assert.equal(mealMinutesOf(result), 45);
});

test('an already-stored meal keeps its own length after the setting changes', () => {
  // A day with a meal recorded at 60 minutes. After the setting moves to 45, correcting only
  // the clock-out must not shrink that meal — that would let a setting rewrite the past.
  const result = buildAndValidateTimeline(
    dayWithMeal('2026-07-25T12:00', '2026-07-25T13:00'),
    NOW,
    { current: 45, allowed: [60] },
  );
  assert.equal(mealMinutesOf(result), 60);
});

test('a length that was never stored falls back to the setting', () => {
  // 90 minutes was never saved on this session. It is treated as an attempt to plant an arbitrary length, and the setting is used.
  const result = buildAndValidateTimeline(
    dayWithMeal('2026-07-25T12:00', '2026-07-25T13:30'),
    NOW,
    { current: 45, allowed: [60] },
  );
  assert.equal(mealMinutesOf(result), 45);
});

test('moving a stored meal keeps its length', () => {
  // Moving only the start, from 12:00 to 11:30, keeps the 60 minutes.
  const result = buildAndValidateTimeline(
    dayWithMeal('2026-07-25T11:30', '2026-07-25T12:30'),
    NOW,
    { current: 45, allowed: [60] },
  );
  assert.equal(mealMinutesOf(result), 60);
});

test('the default policy is a one-hour meal', () => {
  assert.equal(DEFAULT_MEAL_POLICY.current, 60);
  assert.deepEqual(DEFAULT_MEAL_POLICY.allowed, []);
});
