import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  clockInMember,
  clockOutMember,
  startBreak,
  startLunch,
  endBreak,
  findOngoingLunch,
  scheduleAutoBack,
  notifyChannelIn,
  notifyChannelOut,
  notifyChannelLunch,
  notifyChannelBreak,
  notifyChannelBack,
} from '@/lib/attendance';
import { verifySlackSignature } from '@/lib/slack-verify';

export const runtime = 'nodejs';

function silentOk() {
  return new Response(null, { status: 200 });
}

function ephemeral(text: string) {
  return Response.json({ response_type: 'ephemeral', text });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const verify = verifySlackSignature({
    rawBody,
    timestamp: req.headers.get('x-slack-request-timestamp'),
    signature: req.headers.get('x-slack-signature'),
  });
  if (!verify.ok) {
    return new Response('unauthorized', {
      status: verify.reason === 'misconfigured' ? 500 : 401,
    });
  }

  // Slack retries anything not acknowledged within three seconds. A retry most likely means the first attempt succeeded,
  // so it is answered at once, which avoids a phantom reply and a duplicate channel announcement.
  if (req.headers.get('x-slack-retry-num')) return silentOk();

  const form = new URLSearchParams(rawBody);
  const command = form.get('command');
  const slackUserId = form.get('user_id');
  if (!slackUserId) return ephemeral('That request carried no user information');

  const member = await prisma.member.findFirst({
    where: { slackId: slackUserId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!member) {
    return ephemeral('No offon account is linked to you. Ask your admin to add you.');
  }

  if (command === '/hi') {
    const r = await clockInMember(member.id, 'slack');
    if (r.ok) {
      if (r.memberName) {
        const name = r.memberName;
        const at = r.at;
        const id = member.id;
        after(() => notifyChannelIn(name, at, id));
      }
      return silentOk();
    }
    return ephemeral('You are already clocked in\ud83d\udcbb');
  }
  if (command === '/bye') {
    const r = await clockOutMember(member.id, 'slack');
    if (r.ok) {
      if (r.memberName) {
        const name = r.memberName;
        const at = r.at;
        const id = member.id;
        after(() => notifyChannelOut(name, at, id));
      }
      return silentOk();
    }
    if (r.code === 'ON_BREAK') {
      return ephemeral('You are away. Come back before clocking out\ud83d\ude4f');
    }
    if (r.code === 'ON_LUNCH') {
      return ephemeral('You are on a meal. Clock out once it ends\ud83c\udf7d\ufe0f');
    }
    return ephemeral('There is no clock-in recorded\u26a0\ufe0f');
  }
  if (command === '/lunch') {
    const r = await startLunch(member.id, 'slack');
    if (r.ok) {
      // Scheduling the return notice is another round trip, which can blow the three-second budget, so it is deferred.
      const { breakId, endsAt, memberName: name, at } = r;
      const id = member.id;
      after(() => scheduleAutoBack(breakId, name, endsAt, id));
      if (name) after(() => notifyChannelLunch(name, at, id));
      return silentOk();
    }
    if (r.code === 'ON_LUNCH') return ephemeral('You are already on a meal\ud83c\udf7d\ufe0f');
    if (r.code === 'ALREADY_ON_BREAK') return ephemeral('That cannot be used while you are away\u23f8\ufe0f');
    if (r.code === 'ALREADY_DONE') return ephemeral('Today is already finished\ud83c\udf19');
    return ephemeral('Clock in first☀️');
  }
  if (command === '/break') {
    const r = await startBreak(member.id, 'slack');
    if (r.ok) {
      if (r.memberName) {
        const name = r.memberName;
        const at = r.at;
        const id = member.id;
        after(() => notifyChannelBreak(name, at, id));
      }
      return silentOk();
    }
    if (r.code === 'ON_LUNCH') return ephemeral('That cannot be used while you are on a meal\ud83c\udf7d\ufe0f');
    if (r.code === 'ALREADY_ON_BREAK') return ephemeral('You are already marked away\u23f8\ufe0f');
    if (r.code === 'ALREADY_DONE') return ephemeral('Today is already finished\ud83c\udf19');
    return ephemeral('Clock in first☀️');
  }
  if (command === '/back') {
    const r = await endBreak(member.id, 'slack');
    if (r.ok) {
      if (r.memberName) {
        const name = r.memberName;
        const at = r.at;
        const id = member.id;
        after(() => notifyChannelBack(name, at, id));
      }
      return silentOk();
    }
    if (r.code === 'ALREADY_WORKING') return ephemeral('You are already clocked in\ud83d\udcbb');
    // There is nothing to come back from on a meal, so someone on one — rather than on a break — is told it ends by itself.
    if (await findOngoingLunch(member.id)) {
      return ephemeral('A meal ends by itself an hour after it starts\ud83c\udf7d\ufe0f');
    }
    return ephemeral('You are not marked away\u26a0\ufe0f');
  }
  return ephemeral('That command is not supported');
}
