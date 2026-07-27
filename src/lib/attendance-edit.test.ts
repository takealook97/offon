import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
