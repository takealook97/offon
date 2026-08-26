import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDeploymentT } from '@/lib/i18n/deployment';
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

  // Slack retries anything not acknowledged within three seconds. A retry most likely means
  // the first attempt already succeeded, so it is answered 200 straight away — otherwise the
  // person gets a phantom "already working" reply and the channel gets the announcement twice.
  if (req.headers.get('x-slack-retry-num')) return silentOk();

  const form = new URLSearchParams(rawBody);
  const command = form.get('command');
  const slackUserId = form.get('user_id');
  const t = getDeploymentT();
  if (!slackUserId) return ephemeral(t('slack.noUser'));

  const member = await prisma.member.findFirst({
    where: { slackId: slackUserId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!member) {
    return ephemeral(t('slack.noAccount'));
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
    return ephemeral(t('slack.alreadyWorking'));
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
      return ephemeral(t('slack.clockOutWhileAway'));
    }
    if (r.code === 'ON_LUNCH') {
      return ephemeral(t('slack.clockOutWhileMeal'));
    }
    return ephemeral(t('slack.noClockIn'));
  }
  if (command === '/lunch') {
    const r = await startLunch(member.id, 'slack');
    if (r.ok) {
      // Scheduling the return notice means another round trip to Slack, which can blow the
      // three-second budget, so it is deferred until after the acknowledgement.
      const { breakId, endsAt, memberName: name, at } = r;
      const id = member.id;
      after(() => scheduleAutoBack(breakId, name, endsAt, id));
      if (name) after(() => notifyChannelLunch(name, at, id));
      return silentOk();
    }
    if (r.code === 'ON_LUNCH') return ephemeral(t('slack.alreadyOnMeal'));
    if (r.code === 'ALREADY_ON_BREAK') return ephemeral(t('slack.blockedWhileAway'));
    if (r.code === 'ALREADY_DONE') return ephemeral(t('slack.alreadyDone'));
    return ephemeral(t('slack.clockInFirst'));
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
    if (r.code === 'ON_LUNCH') return ephemeral(t('slack.blockedWhileMeal'));
    if (r.code === 'ALREADY_ON_BREAK') return ephemeral(t('slack.alreadyAway'));
    if (r.code === 'ALREADY_DONE') return ephemeral(t('slack.alreadyDone'));
    return ephemeral(t('slack.clockInFirst'));
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
    if (r.code === 'ALREADY_WORKING') return ephemeral(t('slack.alreadyWorking'));
    // There is nothing to come back from on a meal, so someone on one — rather than on a break — is told it ends by itself.
    if (await findOngoingLunch(member.id)) {
      return ephemeral(t('slack.mealAutoReturn'));
    }
    return ephemeral(t('slack.notAway'));
  }
  return ephemeral(t('slack.unknownCommand'));
}
