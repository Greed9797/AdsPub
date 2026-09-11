import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string, entry = 'index.ts') =>
  fileURLToPath(new URL(`./packages/${name}/src/${entry}`, import.meta.url));

/** Testes rodam contra o código-fonte dos pacotes, sem depender do build. */
export default defineConfig({
  resolve: {
    alias: {
      '@adpub/meta-client/write': pkg('meta-client', 'write/index.ts'),
      '@adpub/config': pkg('config'),
      '@adpub/shared': pkg('shared'),
      '@adpub/auth': pkg('auth'),
      '@adpub/crypto': pkg('crypto'),
      '@adpub/rules': pkg('rules'),
      '@adpub/db': pkg('db'),
      '@adpub/ai': pkg('ai'),
      '@adpub/meta-client': pkg('meta-client'),
      '@adpub/telemetry': pkg('telemetry'),
      '@adpub/reports': pkg('reports'),
      '@adpub/analytics': pkg('analytics'),
      '@adpub/creative-intel': pkg('creative-intel'),
    },
  },
  test: {
    globals: false,
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/api/test/**/*.test.ts',
      'apps/worker/test/**/*.test.ts',
      'apps/mcp/test/**/*.test.ts',
      'scripts/test/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    testTimeout: 20_000,
  },
});
