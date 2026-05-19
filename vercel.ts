import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  buildCommand: 'prisma generate && next build',
  regions: ['icn1'],
  crons: [
    { path: '/api/cron/missing-clockin', schedule: '0 1 * * *' },
    { path: '/api/cron/missing-clockout', schedule: '0 10 * * *' },
    // The lunch reminder needs to run every five minutes, past what the hosting plan allows,
    // so it is not registered as a platform cron. An external scheduler
    // hits the endpoint every five minutes. The handler is unchanged, so auth and deduplication behave the same.
    { path: '/api/cron/leave-rollover', schedule: '0 15 31 12 *' },
    { path: '/api/cron/leave-rollover', schedule: '0 15 1-6 1 *' },
  ],
};

export default config;
