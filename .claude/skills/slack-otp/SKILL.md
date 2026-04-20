---
name: slack-otp
description: offon의 Slack 연동(OTP DM, 연차 알림, 근태 누락 알림) 작업과 OTP 생성·argon2 해시 검증 플로우를 다룰 때 반드시 사용. "Slack 알림 추가", "OTP 재발급", "로그인 안 돼요", "연차 승인 알림 바꿔줘" 요청에 트리거.
---

# Slack + OTP

## 의존성
- `@slack/web-api` — `WebClient`
- `argon2` — OTP 해시(argon2id)
- `crypto`(Node 기본) — 6자리 난수

## 환경변수
- `SLACK_BOT_TOKEN=xoxb-...` — Bot User OAuth Token. 필요 scope: `chat:write`, `im:write`.
- `OTP_PEPPER` — 32바이트 랜덤 secret. OTP 해시 시 pepper로 사용.

## OTP 생성 (`src/lib/otp.ts`)
```ts
import crypto from 'node:crypto';
import argon2 from 'argon2';

export function generateCode(): string {
  // 000000 ~ 999999, 선행 0 유지
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
  if (!channel) throw new Error('Slack DM 채널을 열 수 없음');
  await client.chat.postMessage({ channel, text });
}
```

## OTP 로그인 플로우

### POST /api/auth/request-code
1. Rate limit (`otp-request`: IP+email, 30초 1회).
2. `member = findUnique({ email })` + `active: true`.
3. 존재/비활성이면 사용자에게는 "코드 전송 완료"로 반환(정보 노출 방지), 내부 AuditLog에만 `LOGIN_UNKNOWN_EMAIL` 기록.
4. `code = generateCode()`, `hash = hashCode(code)`, `expiresAt = now + 5min`.
5. `LoginCode.create({ memberId, codeHash: hash, expiresAt })`.
6. `sendDm(member.slackId, `offon 로그인 코드: ${code} (5분 유효)`)`.
7. `AuditLog.create({ actorId: member.id, action: 'LOGIN_REQUEST' })`.

### POST /api/auth/verify-code
1. Rate limit (`otp-verify`: IP+email, 분당 10회).
2. `member = findUnique({ email })` + `active: true`.
3. `code = LoginCode.findFirst({ where: { memberId }, orderBy: { createdAt: 'desc' }, take: 1 })`.
4. 검증 체크: `!usedAt && expiresAt > now && attempts < 5`.
5. `verifyCode(code.codeHash, input)` → 실패 시 `attempts++`, 401.
6. 성공: 트랜잭션 내에서 `code.usedAt = now`, JWT 발급, HttpOnly 쿠키 set.
7. `AuditLog.create({ actorId: member.id, action: 'LOGIN_SUCCESS' })`.

## 알림 템플릿
| 이벤트 | 수신자 | 텍스트 |
|--------|--------|--------|
| OTP 요청 | 본인 | `offon 로그인 코드: 123456 (5분 유효)` |
| 연차 신청 | ADMIN 전원 | `{name}님이 {startDate}~{endDate} {type} 연차를 신청했습니다` |
| 연차 승인 | 요청자 | `{startDate}~{endDate} 연차가 승인되었습니다` |
| 연차 반려 | 요청자 | `{startDate}~{endDate} 연차가 반려되었습니다` |
| 누락(출근) | 당사자 본인 | `오전 10시 기준 출근 기록이 없습니다. 확인 부탁드립니다` |
| 누락(퇴근) | 당사자 본인 | `21시 기준 퇴근 기록이 없습니다. 퇴근 처리를 완료해 주세요` |

## Rate limit (`src/lib/rateLimit.ts`)
```ts
import { RateLimiterMemory } from 'rate-limiter-flexible';

export const otpRequestLimiter = new RateLimiterMemory({ points: 1, duration: 30 });
export const otpVerifyLimiter  = new RateLimiterMemory({ points: 10, duration: 60 });
```
핸들러에서:
```ts
try { await otpRequestLimiter.consume(key); } catch { return new Response('too many', { status: 429 }); }
```
**Vercel Fluid Compute 주의**: 인스턴스 재사용이지만 스케일아웃 시 인스턴스마다 별도 메모리. MVP 범위에서 충분. 다중 인스턴스 필요 시 DB-backed로 교체.

## 실패 처리
- Slack API 에러: `AuditLog.action = 'SLACK_SEND_FAIL'` + metadata에 에러 메시지. 로그인 OTP 발송 실패는 예외적으로 500 반환(사용자가 재시도할 수 있게).
- 비활성 유저의 DM 채널 open 실패: 비활성 체크는 호출 전에 이미 하므로 일반적으로 발생 안 함. 발생 시 로그만 남기고 상위 플로우 진행.
