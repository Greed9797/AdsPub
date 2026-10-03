import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * O tracing precisa mirar a raiz do workspace (pnpm): sem isso o Next infere a
 * raiz errada e avisa. `outputFileTracingRoot` é sempre a raiz do monorepo
 * (`apps/web` subindo dois níveis); o `output` standalone só liga na imagem de
 * produção (`NEXT_STANDALONE=1` no Dockerfile), porque o `next start` do
 * dev/e2e não é suportado com esse output.
 */
const config: NextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
  transpilePackages: ['@adpub/auth', '@adpub/config', '@adpub/shared'],
  experimental: { typedRoutes: false, authInterrupts: true },
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
