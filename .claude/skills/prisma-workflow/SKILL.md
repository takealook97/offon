---
name: prisma-workflow
description: How schema changes, migrations and queries are done in offon — the soft-delete convention, the shared timestamp columns, transaction and row-locking patterns, and the singleton client. Use it for adding a model or a column, writing a migration, or changing a query.
---

# Working with Prisma

## Assumptions
- The `postgresql` provider.
- The schema is `prisma/schema.prisma`; the connection comes from `env("DATABASE_URL")`.
- A password may contain characters that need URL-encoding before going into `DATABASE_URL`. Real credentials live only in a local `.env` or in the host's environment settings — never in documentation, a skill, or a commit.

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
```prisma
createdAt  DateTime  @default(now())
updatedAt  DateTime  @updatedAt
deletedAt  DateTime?
```
Written out on each model; Prisma has no mixin syntax.

## The soft-delete convention
- **Reads** always filter on `deletedAt: null`.
- **Deletes** never call `delete`. They set `deletedAt`.
- Partial unique indexes are what make this work alongside uniqueness constraints. They cannot be expressed in the Prisma DSL and exist only as hand-written SQL, so they vanish silently if migrations are ever regenerated from the schema. That has already happened once; see `20260826020000_restore_partial_unique_indexes`.

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

A check made **outside** a transaction guarantees nothing. If another request commits between the check and the write, both pass.

```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM attendance_sessions WHERE id = ${sessionId} FOR UPDATE`;
  // Re-read the state after taking the lock. The lock does not re-run the earlier check.
  const live = await tx.attendanceSession.findFirst({ where: { id: sessionId, deletedAt: null } });
  if (!live || live.endAt) return { code: 'NOT_WORKING' as const };
  // ...
});
```

- This only means anything if **every** path touching the same thing locks the same row. In attendance, clocking out, stepping away, starting a meal and approving a correction all lock the `attendance_sessions` row.
- Lock in one consistent order — session, then attendance or break. Crossing that order deadlocks.
- **Do not over-trust a partial unique index.** `attendance_breaks_open_unique` is conditioned on a null end, so it gives no protection at all to rows whose end is already filled in, which is every meal.
- Never call an external API inside a transaction. Do it after the commit, and when storing the result, take the lock again and confirm the row is still there.

## Migrations
- Locally: `npx prisma migrate dev --name <label>` creates the migration, applies it and regenerates the client.
- In production: run `npx prisma migrate deploy` with the production `DATABASE_URL`. The build only runs `prisma generate`.
- Run `npx prisma generate` after any schema change so the types follow.
- **Migration first, then the code.** Deploying code that reads a column which does not exist yet turns every path through it into a 500. The reverse — the column existing before anything reads it — is harmless.
- **A migration that backfills data cannot be undone.** Old code keeps producing the data you are cleaning up right until the deploy lands, so pick a window when little of it is being created and keep the gap between migration and deploy short.

## Indexes
- Index foreign keys and anything filtered on often.
- Composite uniques carry real meaning: `@@unique([memberId, workDate])` is what makes one attendance row per person per day.

## Checking things by eye
`npx prisma studio` opens on port 5555, which is the quickest way to confirm a schema change landed and to look at sample data.
