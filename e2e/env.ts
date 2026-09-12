/**
 * Ambiente único do e2e: usado pelo `webServer` do Playwright (API + web) e
 * pelos próprios testes (para assinar o cookie de sessão com o mesmo segredo).
 *
 * Aponta para a infra local em portas alternativas (Postgres 55432, Redis
 * 56379, MinIO 59000) e usa segredos de brincadeira — nenhuma credencial real
 * da Meta, do Google ou da Anthropic entra aqui, e nenhuma chamada externa é
 * feita: a Graph API é substituída pelo fake em `scripts/lib/fake-graph.ts`.
 */

/** Portas do harness; troque por env se outro stack da máquina já as usa. */
export const API_PORT = Number(process.env['E2E_API_PORT'] ?? 4310);
export const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 3310);

export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

/** Domínio corporativo aceito no login (o admin do seed nasce aqui dentro). */
export const AUTH_ALLOWED_DOMAIN = 'empresa.com.br';

/** Mesmo segredo assina o JWT no seed e no cookie injetado pelos testes. */
export const AUTH_SECRET = 'e2e-auth-secret-e2e-auth-secret-01';

/**
 * Banco, índice do Redis e bucket exclusivos do e2e: o `adpub` é compartilhado
 * com os smokes e com o dev local, e este harness zera as tabelas antes de
 * semear. Sem isolamento, um `pnpm smoke:integration` rodando em paralelo
 * derruba a suíte (e vice-versa).
 */
export const E2E_DATABASE = 'adpub_e2e';

/**
 * Endereços da infra: padrão local (portas alternativas) e sobrescritos no CI,
 * onde os serviços do runner ficam nas portas canônicas.
 */
export const POSTGRES_BASE_URL =
  process.env.E2E_POSTGRES_BASE_URL ?? 'postgres://adpub:adpub@127.0.0.1:55432';
const REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:56379/3';
const S3_ENDPOINT = process.env.E2E_S3_ENDPOINT ?? 'http://127.0.0.1:59000';

export const E2E_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: `${POSTGRES_BASE_URL}/${E2E_DATABASE}`,
  REDIS_URL,
  S3_ENDPOINT,
  S3_BUCKET: 'adpub-e2e',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'adpubminio',
  S3_SECRET_KEY: 'adpubminio123',
  MASTER_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  META_APP_ID: '000000000000000',
  META_APP_SECRET: 'e2e-app-secret',
  META_API_VERSION: 'v25.0',
  META_TIER: 'limited',
  AUTH_SECRET,
  AUTH_ALLOWED_DOMAIN,
  GOOGLE_CLIENT_ID: 'e2e-google-client',
  GOOGLE_CLIENT_SECRET: 'e2e-google-secret',
  ANTHROPIC_API_KEY: 'e2e-anthropic-key',
  API_PORT: String(API_PORT),
  API_URL,
  WEB_URL,
  LOG_LEVEL: 'warn',
  // O harness semeia do zero: `truncateAllTables` exige este opt-in.
  ADPUB_ALLOW_TRUNCATE: '1',
};
