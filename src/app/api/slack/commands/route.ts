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

  // 3초 ACK 넘기면 Slack이 재전송한다. 재전송분은 1차 처리가 이미 성공했을 가능성이
  // 높으므로 즉시 200을 돌려 "이미 근무중" 유령 메시지와 채널 알림 중복을 막는다.
  if (req.headers.get('x-slack-retry-num')) return silentOk();

  const form = new URLSearchParams(rawBody);
  const command = form.get('command');
  const slackUserId = form.get('user_id');
  if (!slackUserId) return ephemeral('요청에 사용자 정보가 없어요');

  const member = await prisma.member.findFirst({
    where: { slackId: slackUserId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!member) {
    return ephemeral('offon에 연결된 계정이 없어요. 관리자에게 문의해주세요.');
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
    return ephemeral('이미 근무중입니다💻');
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
    return ephemeral('출근 기록이 없습니다⚠️');
  }
  return ephemeral('지원하지 않는 명령이에요');
}
