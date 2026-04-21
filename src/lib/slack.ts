import { WebClient } from '@slack/web-api';

let cachedClient: WebClient | null = null;

function getClient(): WebClient {
  if (cachedClient) return cachedClient;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다');
  cachedClient = new WebClient(token);
  return cachedClient;
}

export async function sendDm(slackUserId: string, text: string): Promise<void> {
  const client = getClient();
  const open = await client.conversations.open({ users: slackUserId });
  const channel = open.channel?.id;
  if (!channel) throw new Error(`Slack DM 채널 열기 실패: ${slackUserId}`);
  await client.chat.postMessage({ channel, text });
}

export async function sendChannel(channel: string, text: string): Promise<void> {
  await getClient().chat.postMessage({ channel, text });
}
