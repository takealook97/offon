---
name: slack-otp
description: offon's Slack integration — sign-in codes by DM, leave notices, missing-record reminders, channel announcements and the slash commands — together with how codes are generated and verified. Use it for adding a notification, changing a message, or anything about signing in.
---

# Slack and sign-in codes

## Dependencies
- `@slack/web-api` for the `WebClient`
- `argon2` for hashing codes (argon2id)
- Node's own `crypto` for the six-digit number

## Environment
- `SLACK_BOT_TOKEN` — the bot user OAuth token. Needs `chat:write`, `im:write` and `commands`.
- `SLACK_OFFON_CHANNEL` — where clock-ins, meals and breaks are announced. Unset, channel announcements are skipped silently.
- `OTP_PEPPER` — a random secret mixed into every code before hashing.

## Generating a code (`src/lib/otp.ts`)
```ts
import crypto from 'node:crypto';
import argon2 from 'argon2';

export function generateCode(): string {
  // 000000 to 999999, keeping any leading zeros
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function hashCode(code: string): Promise<string> {
  return argon2.hash(code + process.env.OTP_PEPPER!, { type: argon2.argon2id });
}

export async function verifyCode(hash: string, code: string): Promise<boolean> {
  return argon2.verify(hash, code + process.env.OTP_PEPPER!);
}
```
The `padStart` matters: `randomInt` will return small numbers, and without it a code goes out as `7` and cannot fill a six-digit field.

## Sending a DM (`src/lib/slack.ts`)
Open the DM channel, then post to it. The channel id from the response is what later calls need.

## Scheduled messages (`scheduleChannel` / `cancelScheduledChannel`)

When something has to be sent at a future time, use Slack's scheduling rather than adding a cron. A cron that runs once a day cannot poll for this, and `chat.scheduleMessage` works with the `chat:write` scope already granted, so no reinstall is needed.

```ts
const scheduled = await scheduleChannel(channel, text, postAt); // {channelId, scheduledMessageId} | null
await cancelScheduledChannel(scheduled.channelId, scheduled.scheduledMessageId);
```

What has to hold:
- **Store the returned `channelId` and cancel with it.** `SLACK_OFFON_CHANNEL` may be a name such as `#offon`, but cancelling requires an id. The `channel` in the response is always an id.
- **If storing the identifier fails, cancel the scheduled message at once.** Otherwise it is orphaned and can never be cancelled.
- **Slack refuses to cancel anything due within 60 seconds.** Scheduling a replacement without checking whether the cancel succeeded sends the same message twice. That is why the cancel helper returns a boolean.
- **When storing the identifier on a row, confirm inside a lock that the row is still there.** The Slack path defers scheduling until after the response, and an approved correction can replace the row in that window.

The meal return notice uses all of this, in `scheduleAutoBack` and `cancelAutoBack` in `src/lib/attendance.ts`, storing its identifiers on the break row.

## The sign-in flow

### Requesting a code
1. Rate limit by IP and email.
2. Look up an active member by email.
3. If there is none, still answer as though a code was sent — revealing which addresses exist is a gift to an attacker — and record it in the audit log only.
4. Generate a code, hash it, and give it a short expiry.
5. Store the hash, never the code.
6. DM the code to the member's Slack account.
7. Write an audit entry.

In development, with no Slack token, there is nowhere to send the DM, so the code is printed to the console. Without that, anyone who has not wired up Slack yet cannot sign in at all and never gets the app running. That branch is unreachable in production.

### Verifying a code
1. Rate limit by IP and email.
2. Look up an active member by email.
3. Take their most recent code.
4. It has to be unused, unexpired, and under the attempt limit.
5. Verify it; a failure increments the attempts and answers 401.
6. On success, mark it used, issue the token and set an HttpOnly cookie — all in one transaction.
7. Write an audit entry.

## What gets sent where

DMs go to one person: their sign-in code, the outcome of their leave request, or a reminder that a clock-in or clock-out is missing. Admins are DMed when something needs approving.

Channel announcements go to `SLACK_OFFON_CHANNEL`: clocking in and out, starting a meal, stepping away and coming back. The first line is the timestamp and the second is the message. The web sends these directly; a slash command defers them until after the acknowledgement, because Slack allows only three seconds to acknowledge.

The wording for coming back is built in one place and shared by both cases — returning from a break, which sends immediately, and a meal ending, which was scheduled in advance. The channel must not be able to tell the two apart, so do not split them.

Every string here is a message key resolved through `getDeploymentT()`, not a literal. Slack has no request cookie to read a language from, so it uses the deployment's language.

## Slash commands

Clocking in, clocking out, starting a meal, stepping away and coming back. A meal has no coming-back command, since it ends on its own; asking to come back from one answers with when it will end. While a meal is running, clocking out and stepping away are both refused.

Slack retries anything not acknowledged within three seconds. A retry almost always means the first attempt succeeded, so it is answered immediately — otherwise the person gets a phantom reply and the channel gets the announcement twice.

## Rate limiting
In-memory limiters, one for requesting a code and one for verifying it. Note that instances are reused but each scaled-out instance keeps its own memory; move this to the database if that stops being good enough.

## When things fail
- A Slack error is recorded as `SLACK_SEND_FAIL` in the audit log with the message, and the flow continues. The exception is sending a sign-in code: there is nothing to continue to, so it answers 500 and the person can try again.
- Opening a DM channel for a deactivated user should not happen, since the active check comes first. If it does, log it and carry on.
