import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Emits only what running in Docker needs. It makes no difference to a Vercel deploy.
  output: 'standalone',
};

export default nextConfig;
