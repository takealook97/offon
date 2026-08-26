// Must come first: it puts the Slack stand-in in place before anything reaches the real client.
import { slackCalls, resetSlackCalls, slackTexts } from '@/test/slack';

import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import {
  REMINDER_LEAD_MINUTES,
  notifyBookingCreated,
  scheduleBookingReminders,
  cancelBookingReminders,
} from './room-booking-server';

/**
 * The notification side of meeting rooms. Nothing here talks to Slack: `@slack/web-api` is
 * replaced before import, so the real client is never constructed and there is no path to the
 * network. `lib/slack.ts` still runs for real on top of the stand-in, so opening a DM channel
 * before posting to it, and converting a Date into Slack's `post_at` seconds, are exercised
 * rather than mocked away.
 *
 * What matters is who gets told, when, and that a scheduled message is never left behind
 * without a record — a reminder that cannot be cancelled goes out for a meeting that was
 * called off.
 */

const MIN = 60_000;

before(() => ensureSchema());
beforeEach(async () => {
  await resetDatabase();
  resetSlackCalls();
});
after(() => prisma.$disconnect());

async function room(name = 'Board Room') {
  return prisma.meetingRoom.create({ data: { name } });
}

/** A confirmed booking starting `startsInMinutes` from now, with the given attendees. */
async function booking(opts: {
  organiserId: number;
  roomId: number;
  attendeeIds?: number[];
  startsInMinutes?: number;
  title?: string;
}) {
  const startAt = new Date(Date.now() + (opts.startsInMinutes ?? 60) * MIN);
  return prisma.roomBooking.create({
    data: {
      roomId: opts.roomId,
      memberId: opts.organiserId,
      type: 'INTERNAL',
      title: opts.title ?? 'Weekly sync',
      startAt,
      endAt: new Date(startAt.getTime() + 30 * MIN),
      attendees: { create: (opts.attendeeIds ?? []).map((memberId) => ({ memberId })) },
    },
  });
}

test('the stand-in is in place, so nothing can reach Slack', async () => {
  // Arrange + Act
  const { WebClient } = await import('@slack/web-api');

  // Assert
  assert.equal(WebClient.name, 'FakeWebClient', 'the real Slack client must not be reachable');
});

test('booking notice goes to the organiser and every attendee', async () => {
  // Arrange
  const organiser = await createMember('Ada');
  const guest = await createMember('Grace');
  const r = await room();
  const b = await booking({ organiserId: organiser.id, roomId: r.id, attendeeIds: [guest.id] });

  // Act
  await notifyBookingCreated(b.id);

  // Assert
  const dms = slackCalls().filter((c) => c.kind === 'post').map((c) => c.channel);
  assert.deepEqual(dms.sort(), [`D-${organiser.slackId}`, `D-${guest.slackId}`].sort());
});

test('a booking with no attendees still tells the organiser', async () => {
  // Arrange
  const organiser = await createMember('Ada');
  const r = await room();
  const b = await booking({ organiserId: organiser.id, roomId: r.id });

  // Act
  await notifyBookingCreated(b.id);

  // Assert
  const posts = slackCalls().filter((c) => c.kind === 'post');
  assert.equal(posts.length, 1);
});

test('the notice names the meeting and everyone in it', async () => {
  // Arrange
  const organiser = await createMember('Ada');
  const guest = await createMember('Grace');
  const r = await room();
  const b = await booking({
    organiserId: organiser.id,
    roomId: r.id,
    attendeeIds: [guest.id],
    title: 'Quarterly review',
  });

  // Act
  await notifyBookingCreated(b.id);

  // Assert
  const text = slackTexts()[0];
  assert.match(text, /Quarterly review/);
  assert.match(text, /Ada/);
  assert.match(text, /Grace/);
});

test('someone who has left is not messaged, but is still named on the record', async () => {
  // Arrange
  const organiser = await createMember('Ada');
  const left = await createMember('Grace');
  await prisma.member.update({ where: { id: left.id }, data: { deletedAt: new Date() } });
  const r = await room();
  const b = await booking({ organiserId: organiser.id, roomId: r.id, attendeeIds: [left.id] });

  // Act
  await notifyBookingCreated(b.id);

  // Assert
  const posts = slackCalls().filter((c) => c.kind === 'post');
  assert.equal(posts.length, 1, 'only the organiser is messaged');
  assert.equal(posts[0].channel, `D-${organiser.slackId}`);
  assert.match(posts[0].text, /Grace/, 'the attendee list stays true to what was booked');
});

test('a cancelled booking notifies nobody', async () => {
  // Arrange
  const organiser = await createMember('Ada');
  const r = await room();
  const b = await booking({ organiserId: organiser.id, roomId: r.id });
  await prisma.roomBooking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });

  // Act
  await notifyBookingCreated(b.id);

  // Assert
  assert.equal(slackCalls().length, 0);
});

test('the reminder is scheduled for the lead time before the meeting', async () => {
  // Arrange
  const organiser = await createMember('Ada');
  const r = await room();
  const b = await booking({ organiserId: organiser.id, roomId: r.id, startsInMinutes: 60 });

  // Act
  await scheduleBookingReminders(b.id);

  // Assert
  const scheduled = slackCalls().filter((c) => c.kind === 'schedule');
  assert.equal(scheduled.length, 1);
  const expected = Math.floor((b.startAt.getTime() - REMINDER_LEAD_MINUTES * MIN) / 1000);
  assert.equal(scheduled[0].postAt, expected, 'Slack takes seconds, not milliseconds');
});

test('a scheduled reminder is recorded so it can be cancelled later', async () => {
  // Arrange
  const organiser = await createMember('Ada');
  const guest = await createMember('Grace');
  const r = await room();
  const b = await booking({ organiserId: organiser.id, roomId: r.id, attendeeIds: [guest.id] });

  // Act
  await scheduleBookingReminders(b.id);

  // Assert
  const rows = await prisma.roomBookingReminder.findMany({ where: { bookingId: b.id } });
  assert.equal(rows.length, 2, 'one per person told');
  for (const row of rows) {
    assert.ok(row.channelId.startsWith('D-'), 'the DM channel id is kept, not the user id');
    assert.ok(row.scheduledMessageId.length > 0);
  }
});

test('a meeting starting sooner than the lead time schedules nothing', async () => {
  // Arrange: Slack refuses a post_at in the past.
  const organiser = await createMember('Ada');
  const r = await room();
  const b = await booking({ organiserId: organiser.id, roomId: r.id, startsInMinutes: 1 });

  // Act
  await scheduleBookingReminders(b.id);

  // Assert
  assert.equal(slackCalls().filter((c) => c.kind === 'schedule').length, 0);
  assert.equal(await prisma.roomBookingReminder.count(), 0);
});

test('cancelling withdraws every scheduled reminder and clears the records', async () => {
  // Arrange
  const organiser = await createMember('Ada');
  const guest = await createMember('Grace');
  const r = await room();
  const b = await booking({ organiserId: organiser.id, roomId: r.id, attendeeIds: [guest.id] });
  await scheduleBookingReminders(b.id);
  const stored = await prisma.roomBookingReminder.findMany({
    where: { bookingId: b.id },
    select: { channelId: true, scheduledMessageId: true },
  });
  assert.equal(stored.length, 2, 'precondition: two reminders were scheduled');
  resetSlackCalls();

  // Act
  await cancelBookingReminders(b.id);

  // Assert: every stored message was withdrawn, by exactly the ids that were kept.
  const cancels = slackCalls().flatMap((c) =>
    c.kind === 'cancel' ? [{ channelId: c.channel, scheduledMessageId: c.scheduledMessageId }] : [],
  );
  const key = (r: { channelId: string; scheduledMessageId: string }) =>
    `${r.channelId}/${r.scheduledMessageId}`;
  assert.deepEqual(cancels.map(key).sort(), stored.map(key).sort());
  assert.equal(await prisma.roomBookingReminder.count(), 0, 'no record may outlive its message');
});

test('cancelling a booking that never had reminders is a no-op', async () => {
  // Arrange
  const organiser = await createMember('Ada');
  const r = await room();
  const b = await booking({ organiserId: organiser.id, roomId: r.id });

  // Act
  await cancelBookingReminders(b.id);

  // Assert
  assert.equal(slackCalls().length, 0);
});
