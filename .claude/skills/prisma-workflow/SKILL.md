---
name: prisma-workflow
description: offon의 Prisma 스키마 추가/수정/마이그레이션/쿼리 작업에 반드시 사용. soft-delete(`deletedAt`) 규약, 공통 타임스탬프 컬럼, 트랜잭션 패턴, 싱글턴 클라이언트. "모델 추가", "컬럼 추가", "마이그레이션 만들어줘", "이 쿼리 바꿔줘" 같은 요청에 트리거.
---

# Prisma 작업 규약

## 전제
- `postgresql` provider, AWS RDS (`lukuku-app.clyyn7nia8dj.ap-northeast-2`).
- 스키마: `prisma/schema.prisma`. 연결: `env("DATABASE_URL")`.
- 비밀번호에 특수문자(`!`, `#`)가 들어가므로 URL-encode 필수: `REDACTED_PW`.

## 싱글턴 클라이언트 (`src/lib/prisma.ts`)
```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```
Vercel Fluid Compute 환경에서도 인스턴스 재사용되므로 동일 패턴 사용.

## 공통 컬럼 규약
모든 모델에 다음 3개 컬럼을 포함한다:
```prisma
createdAt  DateTime  @default(now())
updatedAt  DateTime  @updatedAt
deletedAt  DateTime?
```
스키마 작성 시 매번 반복해 넣는다 (Prisma는 mixin 문법이 없음).

## soft-delete 쿼리 규약
- **SELECT**: 항상 `where: { deletedAt: null, ... }` 적용.
- **DELETE**: `prisma.model.delete(...)` 금지. `update({ where: {id}, data: { deletedAt: new Date() } })`.
- 유일성 제약이 있는 필드(예: `Member.email`)를 재사용 가능하게 하려면 partial unique index가 필요하지만, MVP에서는 이메일 중복을 허용하지 않는다고 가정(실제 탈퇴 사례 없음).

## 트랜잭션 패턴
```ts
await prisma.$transaction(async (tx) => {
  await tx.leaveRequest.update({ where: { id }, data: { status: 'APPROVED', approverId } });
  await tx.leaveBalance.update({
    where: { memberId },
    data: { usedDays: { increment: days } },
  });
  await tx.auditLog.create({ data: { actorId, action: 'LEAVE_APPROVE', target: id } });
});
```
Slack DM 호출은 트랜잭션 **바깥에서** (외부 API 실패가 DB를 롤백하면 안 됨).

## 마이그레이션 워크플로우
- **로컬 개발**: `pnpm prisma migrate dev --name <label>` — 마이그레이션 파일 생성 + 적용 + 클라이언트 재생성.
- **프로덕션(Vercel 배포 후)**: 로컬에서 `DATABASE_URL=<prod>` 주입 후 `pnpm prisma migrate deploy`. Vercel 빌드 시 `prisma generate`만 실행 (`vercel.ts`의 buildCommand에 포함).
- 스키마 변경 후 반드시 `pnpm prisma generate` 실행해 타입 반영 확인.

## 인덱스 규약
- FK가 있는 컬럼 + 자주 filter되는 컬럼에 `@@index` 추가.
- 복합 unique: `@@unique([memberId, workDate])` — 1인 1일 1 attendance.

## Prisma Studio로 시각 검증
`pnpm prisma studio` — 로컬 5555 포트. 스키마 반영 여부·샘플 데이터 확인용.

## 자주 쓰는 쿼리 스니펫

### 활성 멤버만 조회
```ts
prisma.member.findMany({ where: { active: true, deletedAt: null } });
```

### 오늘 근태 upsert (KST)
```ts
import { todayKST } from '@/lib/time';
await prisma.attendance.upsert({
  where: { memberId_workDate: { memberId, workDate: todayKST() } },
  update: { clockInAt: new Date(), status: 'WORKING' },
  create: { memberId, workDate: todayKST(), clockInAt: new Date(), status: 'WORKING' },
});
```

### 월간 근태 합산
```ts
const rows = await prisma.attendance.findMany({
  where: { memberId, workDate: { gte: monthStart, lte: monthEnd }, deletedAt: null },
  select: { workedMinutes: true, overtimeMinutes: true },
});
const totalWorked = rows.reduce((s, r) => s + r.workedMinutes, 0);
```
