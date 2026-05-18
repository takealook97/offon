import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  buildCommand: 'prisma generate && next build',
  regions: ['icn1'],
  crons: [
    { path: '/api/cron/missing-clockin', schedule: '0 1 * * *' },
    { path: '/api/cron/missing-clockout', schedule: '0 10 * * *' },
    { path: '/api/cron/lunch-reminder', schedule: '*/5 3-7 * * *' },
    { path: '/api/cron/leave-rollover', schedule: '0 15 31 12 *' },
    { path: '/api/cron/leave-rollover', schedule: '0 15 1-6 1 *' },
  ],
};

export default config;
