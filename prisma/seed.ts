import { Prisma, PrismaClient } from '@prisma/client';
import { kstYear } from '../src/lib/time';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const name = process.env.SEED_ADMIN_NAME;
  const slackId = process.env.SEED_ADMIN_SLACK_ID;

  if (!email || !name || !slackId) {
    console.error(
      'SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_ADMIN_SLACK_ID 환경변수가 필요합니다',
    );
    process.exit(1);
  }

  const totalDays = Number(process.env.SEED_ADMIN_TOTAL_DAYS ?? '15');

  const existing = await prisma.member.findUnique({ where: { email } });
  if (existing) {
    console.log(`이미 존재: ${email} (id=${existing.id})`);
    return;
  }

  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.member.create({
      data: { name, email, slackId, role: 'ADMIN' },
    });
    await tx.leaveBalance.create({
      data: {
        memberId: m.id,
        baseDays: new Prisma.Decimal(totalDays),
        rolloverYear: kstYear(),
      },
    });
    return m;
  });

  console.log(`관리자 생성 완료: ${member.name} <${member.email}> (id=${member.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
