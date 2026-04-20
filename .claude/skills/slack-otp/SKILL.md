---
name: slack-otp
description: The Slack integration - sign-in codes by DM, leave notices, missing-record reminders and the slash commands - together with how codes are generated and verified.
---

# Slack + OTP

## Dependencies
- `@slack/web-api` — `WebClient`
- `argon2` for hashing codes
- Node's own `crypto` for the six-digit number

## Environment
- `SLACK_BOT_TOKEN` — the bot user OAuth token. Needs `chat:write` and `im:write`.
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

## Slack DM (`src/lib/slack.ts`)
```ts
import { WebClient } from '@slack/web-api';

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function sendDm(slackUserId: string, text: string) {
  const open = await client.conversations.open({ users: slackUserId });
  const channel = open.channel?.id;
  if (!channel) throw new Error('could not open a Slack DM channel');
  await client.chat.postMessage({ channel, text });
}
```

## The sign-in flow

### POST /api/auth/request-code
1. Rate limit the request, by IP and email.
2. `member = findUnique({ email })` + `active: true`.
3. If there is no such member, still answer as though a code was sent, and record it in the audit log only.
4. `code = generateCode()`, `hash = hashCode(code)`, `expiresAt = now + 5min`.
5. `LoginCode.create({ memberId, codeHash: hash, expiresAt })`.
6. `sendDm(member.slackId, `Your offon sign-in code: ${code} (valid for 5 minutes)`)`.
7. `AuditLog.create({ actorId: member.id, action: 'LOGIN_REQUEST' })`.

### POST /api/auth/verify-code
1. Rate limit the verification, by IP and email.
2. `member = findUnique({ email })` + `active: true`.
3. `code = LoginCode.findFirst({ where: { memberId }, orderBy: { createdAt: 'desc' }, take: 1 })`.
4. It has to be unused, unexpired, and under the attempt limit.
5. Verify it; a failure increments the attempts and answers 401.
6. On success, mark it used, issue the token and set an HttpOnly cookie, all in one transaction.
7. `AuditLog.create({ actorId: member.id, action: 'LOGIN_SUCCESS' })`.

## What gets sent where
| Event | Recipient | Message |
|--------|--------|--------|
| Sign-in code | the person | their code, valid for a few minutes |
| Leave requested | every admin | who requested what, and for when |
| Leave approved | the requester | that their leave was approved |
| Leave rejected | the requester | that their leave was rejected |
| Missing clock-in | the person | that no clock-in is recorded yet |
| Missing clock-out | the person | that no clock-out is recorded yet |

## Rate limit (`src/lib/rateLimit.ts`)
```ts
import { RateLimiterMemory } from 'rate-limiter-flexible';

export const otpRequestLimiter = new RateLimiterMemory({ points: 1, duration: 30 });
export const otpVerifyLimiter  = new RateLimiterMemory({ points: 10, duration: 60 });
```
In a handler:
```ts
try { await otpRequestLimiter.consume(key); } catch { return new Response('too many', { status: 429 }); }
```
**Note**: instances are reused but each scaled-out instance keeps its own memory. Move this to the database if that stops being good enough.

## When things fail
- A Slack error is recorded in the audit log with the message, and the flow continues. Sending a sign-in code is the exception: it answers 500 so the person can try again.
- Opening a DM channel for a deactivated user should not happen, since the active check comes first. If it does, log it and carry on.
