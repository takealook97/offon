import { createRequire } from 'node:module';

/**
 * A stand-in for Slack, installed in place of `@slack/web-api` before anything imports it.
 *
 * Interception happens at the library boundary rather than at `lib/slack.ts`, for two reasons.
 * The real `WebClient` is then never constructed, so there is no path to the network even if a
 * token leaks into the environment — the guarantee is structural rather than a promise. And
 * `lib/slack.ts` runs for real on top of it, so opening a DM channel before posting to it, and
 * turning a Date into Slack's `post_at` seconds, are covered rather than mocked away.
 *
 * Import this module before importing anything that reaches Slack.
 */

export type SlackCall =
  | { kind: 'openDm'; users: string }
  | { kind: 'post'; channel: string; text: string }
  | { kind: 'schedule'; channel: string; text: string; postAt: number }
  | { kind: 'cancel'; channel: string; scheduledMessageId: string };

const calls: SlackCall[] = [];

/** Everything Slack was asked to do, in order. */
export function slackCalls(): readonly SlackCall[] {
  return calls;
}

export function resetSlackCalls(): void {
  calls.length = 0;
}

/** Just the messages, for asserting on wording without matching the whole call. */
export function slackTexts(): string[] {
  return calls.flatMap((c) => (c.kind === 'post' || c.kind === 'schedule' ? [c.text] : []));
}

let nextScheduledId = 1;

class FakeWebClient {
  constructor(token?: string) {
    // The token is deliberately unused. Asserting it is a string keeps the shape honest.
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('FakeWebClient: expected a token, same as the real client');
    }
  }

  conversations = {
    open: async ({ users }: { users: string }) => {
      calls.push({ kind: 'openDm', users });
      // A DM channel id derived from the user, so an assertion can tell whose DM it was.
      return { channel: { id: `D-${users}` } };
    },
  };

  chat = {
    postMessage: async ({ channel, text }: { channel: string; text: string }) => {
      calls.push({ kind: 'post', channel, text });
      return { ok: true, ts: '1.1' };
    },
    scheduleMessage: async ({
      channel,
      text,
      post_at,
    }: {
      channel: string;
      text: string;
      post_at: number;
    }) => {
      calls.push({ kind: 'schedule', channel, text, postAt: post_at });
      return { ok: true, channel, scheduled_message_id: `Q${nextScheduledId++}` };
    },
    deleteScheduledMessage: async ({
      channel,
      scheduled_message_id,
    }: {
      channel: string;
      scheduled_message_id: string;
    }) => {
      calls.push({ kind: 'cancel', channel, scheduledMessageId: scheduled_message_id });
      return { ok: true };
    },
  };
}

/**
 * Puts the stand-in in place. Called on import, before the module under test is loaded.
 *
 * The real package is replaced in the module cache, so a later `import '@slack/web-api'`
 * resolves to this and the genuine client is never reachable from a test run.
 */
function installFakeSlack(): void {
  const req = createRequire(import.meta.url);
  const id = req.resolve('@slack/web-api');
  req.cache[id] = {
    id,
    filename: id,
    loaded: true,
    exports: { WebClient: FakeWebClient },
  } as never;
  // lib/slack.ts refuses to build a client without one, and the value is never sent anywhere.
  process.env.SLACK_BOT_TOKEN ??= 'xoxb-test-token-never-used';
}

installFakeSlack();
