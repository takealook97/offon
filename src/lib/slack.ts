import { WebClient } from '@slack/web-api';

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function sendDm(slackUserId: string, text: string): Promise<void> {
  const open = await client.conversations.open({ users: slackUserId });
  const channel = open.channel?.id;
  if (!channel) throw new Error(`could not open a Slack DM channel for ${slackUserId}`);
  await client.chat.postMessage({ channel, text });
}
