import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  clockInMember,
  clockOutMember,
  notifyChannelIn,
  notifyChannelOut,
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
    return ephemeral('There is no clock-in recorded\u26a0\ufe0f');
  }
  return ephemeral('That command is not supported');
}
