import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { kstYear } from '@/lib/time';
import { getT } from '@/lib/i18n/server';

const CreateBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  slackId: z.string().min(1),
  position: z.string().optional(),
  role: z.enum(['EMPLOYEE', 'ADMIN']).default('EMPLOYEE'),
  baseDays: z.number().min(0).max(365).default(0),
});

const UpdateBody = z.object({
  id: z.coerce.number().int(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  slackId: z.string().min(1).optional(),
  position: z.string().optional(),
  role: z.enum(['EMPLOYEE', 'ADMIN']).optional(),
  excludeMissingNotify: z.boolean().optional(),
  baseDays: z.number().min(0).max(365).optional(),
  bonusDays: z.number().min(-365).max(365).optional(),
});

export async function POST(req: NextRequest) {
  const t = await getT();
  try {
    const admin = await requireAdmin();
    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: t('api.badInput') }, { status: 400 });
    }
    const d = parsed.data;
    const created = await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          name: d.name,
          email: d.email,
          slackId: d.slackId,
          position: d.position,
          role: d.role,
        },
      });
      await tx.leaveBalance.create({
        data: {
          memberId: member.id,
          baseDays: new Prisma.Decimal(d.baseDays),
          rolloverYear: kstYear(),
        },
      });
      return member;
    });
    await logAudit({
      actorId: admin.memberId,
      action: 'MEMBER_CREATE',
      target: String(created.id),
      metadata: { email: d.email ?? null },
    });
    return NextResponse.json({ ok: true, member: created });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const t = await getT();
  try {
    const admin = await requireAdmin();
    const parsed = UpdateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: t('api.badInput') }, { status: 400 });
    }
    const { id, baseDays, bonusDays, ...rest } = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.member.update({ where: { id }, data: rest });
      if (baseDays !== undefined || bonusDays !== undefined) {
        await tx.leaveBalance.upsert({
          where: { memberId: id },
          create: {
            memberId: id,
            baseDays: new Prisma.Decimal(baseDays ?? 0),
            bonusDays: new Prisma.Decimal(bonusDays ?? 0),
            rolloverYear: kstYear(),
          },
          update: {
            ...(baseDays !== undefined && { baseDays: new Prisma.Decimal(baseDays) }),
            ...(bonusDays !== undefined && { bonusDays: new Prisma.Decimal(bonusDays) }),
          },
        });
      }
    });
    await logAudit({
      actorId: admin.memberId,
      action: 'MEMBER_UPDATE',
      target: String(id),
      metadata: { fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
