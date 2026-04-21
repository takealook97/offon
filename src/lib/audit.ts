import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export async function logAudit(params: {
  actorId?: number | null;
  action: string;
  target?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        action: params.action,
        target: params.target ?? null,
        metadata: params.metadata,
      },
    });
  } catch (err) {
    // A failed audit write must not stop the flow above it, so it only reaches the console.
    console.error('[audit] insert failed', err);
  }
}
