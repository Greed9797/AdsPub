import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@adpub/auth', '@adpub/config', '@adpub/shared'],
  experimental: { typedRoutes: false },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'x-frame-options', value: 'DENY' },
          { key: 'referrer-policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
