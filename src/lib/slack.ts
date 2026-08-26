import { WebClient } from '@slack/web-api';

let cachedClient: WebClient | null = null;

function getClient(): WebClient {
  if (cachedClient) return cachedClient;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set');
  cachedClient = new WebClient(token);
  return cachedClient;
}

export async function sendDm(slackUserId: string, text: string): Promise<void> {
  const client = getClient();
  const open = await client.conversations.open({ users: slackUserId });
  const channel = open.channel?.id;
  if (!channel) throw new Error(`Could not open a Slack DM channel for ${slackUserId}`);
  await client.chat.postMessage({ channel, text });
}

export async function sendChannel(channel: string, text: string): Promise<void> {
  await getClient().chat.postMessage({ channel, text });
}

export type ScheduledChannelMessage = {
  channelId: string;
  scheduledMessageId: string;
};

/**
 * Schedules a channel message for a future time, via Slack's chat.scheduleMessage.
 * This is how send-in-N-minutes works without a cron, and it needs no scope beyond chat:write.
 * The channelId returned is the `channel` from the response, always an ID, so it can be used
 * directly when cancelling.
 */
export async function scheduleChannel(
  channel: string,
  text: string,
  postAt: Date,
): Promise<ScheduledChannelMessage | null> {
  const res = await getClient().chat.scheduleMessage({
    channel,
    text,
    post_at: Math.floor(postAt.getTime() / 1000),
  });
  const channelId = res.channel;
  const scheduledMessageId = res.scheduled_message_id;
  if (!channelId || !scheduledMessageId) return null;
  return { channelId, scheduledMessageId };
}

/**
 * Schedules a DM for a future time. It opens the DM channel and hands it to scheduleChannel.
 * This is how something like a pre-meeting reminder is sent without a cron.
 */
export async function scheduleDm(
  slackUserId: string,
  text: string,
  postAt: Date,
): Promise<ScheduledChannelMessage | null> {
  const open = await getClient().conversations.open({ users: slackUserId });
  const channel = open.channel?.id;
  if (!channel) throw new Error(`Could not open a Slack DM channel for ${slackUserId}`);
  return scheduleChannel(channel, text, postAt);
}

/** Cancels a scheduled message. Slack refuses to cancel anything due within 60 seconds, so this can fail. */
export async function cancelScheduledChannel(
  channelId: string,
  scheduledMessageId: string,
): Promise<void> {
  await getClient().chat.deleteScheduledMessage({
    channel: channelId,
    scheduled_message_id: scheduledMessageId,
  });
}
