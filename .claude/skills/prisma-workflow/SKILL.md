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

## Serialising races: lock the row, then check again

A check made **outside** a transaction guarantees nothing against concurrent requests.
If another request commits between the check and the write, both get through.

```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM attendance_sessions WHERE id = ${sessionId} FOR UPDATE`;
  // Re-read and re-decide after taking the lock. The lock does not re-run the earlier check.
  const live = await tx.attendanceSession.findFirst({ where: { id: sessionId, deletedAt: null } });
  if (!live || live.endAt) return { code: 'NOT_WORKING' as const };
  ...
});
```

- This only means anything if **every** path touching the same thing locks the same row.
  In attendance, clocking out, stepping away, starting a meal and approving a correction all lock the session row.
- Lock in one consistent order: session, then attendance or break. Crossing that order deadlocks.
- **Do not over-trust a partial unique index.** The one covering open breaks
  is conditioned on a null end, so it gives no protection at all to rows whose end is filled in, which is every meal.
- Never call an external API inside a transaction. Do it after the commit, and
  and when storing the result, take the lock again and confirm the row is still there.

## Migrations
- **Locally**: `prisma migrate dev` creates the migration, applies it and regenerates the client.
- **In production**: run `prisma migrate deploy` with the production connection string. The build only runs `prisma generate`.
- Run `prisma generate` after any schema change so the types follow.
- **Migration first, then the code.** Deploying code that reads a column which does not exist yet
  turns every path through it into a 500. The reverse is harmless, since nothing reads it yet.
- **A migration that backfills data cannot be undone.** Old code keeps producing that data
  right until the deploy lands, so pick a window when little of it is being created and
  Keep the gap between the migration and the deploy short.

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
