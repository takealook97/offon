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
    // 감사 로그 실패가 상위 플로우를 막지 않도록 console만 남김.
    console.error('[audit] insert failed', err);
  }
}
