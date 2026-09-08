import { defineConfig, devices } from '@playwright/test';

import { API_URL, E2E_ENV, WEB_PORT, WEB_URL } from './e2e/env.js';

/**
 * E2E das jornadas 1, 3 e 5 (T095). Sobe dois processos: a API real com o
 * worker embutido e a Graph API falsa (`scripts/e2e/server.ts`) e o web em
 * modo produção. Nenhuma chamada sai para a Meta.
 */
// O build do web leva ~7s e roda sempre: rodar o e2e contra um `.next` velho
// esconderia justamente as regressões de UI que estas jornadas existem para pegar.
const web = `pnpm --filter @adpub/web run build && pnpm --filter @adpub/web exec next start -p ${WEB_PORT}`;

export default defineConfig({
  testDir: 'e2e',
  reporter: 'line',
  // As jornadas compartilham o mesmo banco semeado uma única vez: nada de paralelismo.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm exec tsx scripts/e2e/server.ts',
      url: `${API_URL}/health`,
      env: E2E_ENV,
      stdout: 'pipe',
      stderr: 'pipe',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: web,
      url: WEB_URL,
      env: { ...E2E_ENV, PORT: String(WEB_PORT) },
      stdout: 'pipe',
      stderr: 'pipe',
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
