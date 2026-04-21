---
name: prisma-workflow
description: How schema changes, migrations and queries are done here - the soft-delete convention, the shared timestamp columns, transaction and row-locking patterns, and the singleton client.
---

# Working with Prisma

## Assumptions
- `postgresql` provider, AWS RDS.
- The schema is `prisma/schema.prisma`; the connection comes from `env("DATABASE_URL")`.
- A password may contain characters that need URL-encoding before going into the connection string. Real credentials live only in a local env file or the host's settings, never in documentation or a commit.

## The singleton client (`src/lib/prisma.ts`)
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
Instances are reused on Fluid Compute too, so the same pattern holds there.

## Columns every model carries
Every model carries these three columns:
```prisma
createdAt  DateTime  @default(now())
updatedAt  DateTime  @updatedAt
deletedAt  DateTime?
```
Written out on each model; Prisma has no mixin syntax.

## The soft-delete convention
- **Reads** always filter on `deletedAt: null`.
- **Deletes** never call `delete`; they set `deletedAt`.
- Reusing a unique field after a soft delete would need a partial unique index; for now duplicates are simply not allowed.

## Transactions
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
Slack calls go **outside** the transaction. An external API failing must not roll back the database.

## Migrations
- **Locally**: `prisma migrate dev` creates the migration, applies it and regenerates the client.
- **In production**: run `prisma migrate deploy` with the production connection string. The build only runs `prisma generate`.
- Run `prisma generate` after any schema change so the types follow.

## Indexes
- Index foreign keys and anything filtered on often.
- A composite unique enforces one attendance row per person per day.

## Checking things by eye
`prisma studio` opens on port 5555, which is the quickest way to confirm a schema change landed.

## Common queries

### Active members only
```ts
prisma.member.findMany({ where: { active: true, deletedAt: null } });
```

### Upserting today's attendance
```ts
import { todayKST } from '@/lib/time';
await prisma.attendance.upsert({
  where: { memberId_workDate: { memberId, workDate: todayKST() } },
  update: { clockInAt: new Date(), status: 'WORKING' },
  create: { memberId, workDate: todayKST(), clockInAt: new Date(), status: 'WORKING' },
});
```

### Monthly totals
```ts
const rows = await prisma.attendance.findMany({
  where: { memberId, workDate: { gte: monthStart, lte: monthEnd }, deletedAt: null },
  select: { workedMinutes: true, overtimeMinutes: true },
});
const totalWorked = rows.reduce((s, r) => s + r.workedMinutes, 0);
```
