/**
 * Servidor de apoio do e2e (T095): sobe a API real (`buildApp`) com o worker
 * embutido — as filas executam `runPublish`/`runSync` na hora — e com a Graph
 * API falsa de `scripts/lib/fake-graph.ts` injetada em todo cliente Meta.
 * Nenhuma chamada sai para a Meta, o Google ou a Anthropic.
 *
 * Antes de escutar, zera o banco e semeia o cenário das jornadas 1, 3 e 5:
 * conexão sincronizada, usuário admin, cliente "Loja Teste", defaults da conta
 * e um criativo 1200x1200 aprovado. Os IDs gerados vão para
 * `e2e/.artifacts/seed.json`, que as specs leem.
 *
 * Uso: `tsx scripts/e2e/server.ts` (o Playwright faz isso pelo `webServer`).
 */
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { AiClient, trackedInvoker } from '@adpub/ai';
import { ingestFile, tempFileFromBytes } from '@adpub/assets';
import { hashPassword, mintSessionToken } from '@adpub/auth';
import { loadServerEnv } from '@adpub/config';
import {
  createConnection,
  createDb,
  createUser,
  truncateAllTables,
  setAccountPages,
  updateAccountDefaults,
  upsertAccounts,
  saveAiUsage,
} from '@adpub/db';
import { MetaClient } from '@adpub/meta-client';
import { Storage } from '@adpub/storage';
import { buildApp } from '@adpub/api/app';
import { aiCacheFor } from '@adpub/api/services/batch-plan';
import type { ApiDeps, JobRef, Queues } from '@adpub/api/lib/deps';
import { createAlerter } from '@adpub/worker/alerts';
import { createMetaFactory } from '@adpub/worker/meta';
import type { WorkerContext } from '@adpub/worker/context';
import { runAnalysis } from '@adpub/worker/analysis/run';
import { runDriveImport } from '@adpub/worker/drive/import';
import { runPublish } from '@adpub/worker/publish/pipeline';
import { runSync } from '@adpub/worker/sync/connection';
import { Redis } from 'ioredis';
import pino from 'pino';
import sharp from 'sharp';

import { createFakeGraph } from '../lib/fake-graph.js';
import { SEED_FILE, type SeedData } from '../../e2e/seed-handoff.js';
import { E2E_DATABASE, POSTGRES_BASE_URL } from '../../e2e/env.js';

const execFile = promisify(execFileCallback);

const CLIENT_NAME = 'Loja Teste';
const LANDING_DOMAIN = 'lojateste.com.br';
const LANDING = `https://${LANDING_DOMAIN}/inverno`;
const AD_ACCOUNT_ID = 'act_1030000000001';
const AD_ACCOUNT_NAME = 'Loja Teste - BR';
const REVIEW_ACCOUNT_ID = 'act_1030000000002';
const REVIEW_ACCOUNT_NAME = 'Loja Teste - SP';
const PAGE_ID = '102030405060708';
const IG_ID = '17841400000000001';
const PIXEL_ID = '99887766554433';
const DAILY_AD_CAP = 5;
const CONNECTION_LABEL = 'BM principal (e2e)';
const BUSINESS_ID = '1789000000000001';
const FAKE_META_TOKEN = 'EAA-token-de-e2e-nao-real-0123456789';
const ASSET_FILENAME = 'inverno-e2e.jpg';

/**
 * Plano fixo da IA falsa (mesma forma do smoke): 1 campanha, 1 conjunto,
 * 1 criativo × 2 copies. Sem rede e sem variação entre execuções.
 */
function fakeAiInvoker(assetId: string) {
  return async () => ({
    input: {
      campaigns: [
        {
          key: 'c1',
          name: 'Loja Teste_trafego_inverno',
          objective: 'OUTCOME_TRAFFIC',
          special_ad_categories: [],
        },
      ],
      adsets: [
        {
          key: 'a1',
          name: 'Frio - Advantage+',
          optimization_goal: 'LINK_CLICKS',
          billing_event: 'IMPRESSIONS',
          advantage_audience: true,
          campaign_key: 'c1',
        },
      ],
      items: [
        {
          format: 'single_image',
          asset_ids: [assetId],
          campaign_ref: { kind: 'new', key: 'c1' },
          adset_ref: { kind: 'new', key: 'a1' },
          copies: [
            {
              primary_text: 'Coleção de inverno com 20% OFF até sexta. Use o cupom INVERNO20.',
              headline: 'Inverno com 20% OFF',
              description: 'Frete grátis acima de R$ 199',
              cta: 'SHOP_NOW',
              link: LANDING,
            },
            {
              primary_text: 'Últimos dias: 20% OFF na coleção de inverno com o cupom INVERNO20.',
              headline: 'Últimos dias de 20% OFF',
              description: 'Estoque limitado',
              cta: 'SHOP_NOW',
              link: LANDING,
            },
          ],
        },
      ],
      pending: [{ field: 'orcamento', reason: 'Orçamento diário não informado no briefing.' }],
      notes: 'Plano do e2e.',
    },
    inputTokens: 1200,
    outputTokens: 800,
  });
}

/**
 * A9: análise de conteúdo da IA falsa — uma observação com evidência no frame
 * em t=0, que é o único instante de uma imagem estática.
 */
function fakeAnalysisPayload() {
  return {
    observations: [
      {
        tipo: 'oferta',
        texto: 'A peça mostra a coleção de inverno com 20% OFF.',
        evidence_refs: [{ kind: 'frame', t: 0, detail: 'texto de oferta visível no frame t=0' }],
      },
    ],
    limitations: ['transcrição indisponível'],
  };
}

/**
 * O e2e roda em um banco só dele (`adpub_e2e`): cria se não existir e aplica as
 * migrações antes de qualquer conexão de trabalho. Idempotente — a partir da
 * segunda execução custa uma consulta e um `drizzle migrate` sem trabalho.
 */
async function prepararBanco(): Promise<void> {
  const manutencao = createDb(`${POSTGRES_BASE_URL}/postgres`, { max: 1, onNotice: () => {} });
  try {
    const existe = await manutencao.sql`select 1 from pg_database where datname = ${E2E_DATABASE}`;
    if (existe.length === 0) {
      await manutencao.sql.unsafe(`create database "${E2E_DATABASE}"`);
      console.log(`Banco ${E2E_DATABASE} criado para o e2e.`);
    }
  } finally {
    await manutencao.sql.end({ timeout: 5 });
  }

  await execFile('pnpm', ['--filter', '@adpub/db', 'run', 'migrate'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: `${POSTGRES_BASE_URL}/${E2E_DATABASE}` },
  });
}

await prepararBanco();

const env = loadServerEnv();
const { db, sql } = createDb(env.DATABASE_URL, { max: 6, onNotice: () => {} });
const storage = new Storage({
  endpoint: env.S3_ENDPOINT,
  bucket: env.S3_BUCKET,
  region: env.S3_REGION,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
});
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const graph = createFakeGraph();
const log = pino({ level: env.LOG_LEVEL });

const workerCtx: WorkerContext = {
  env,
  db,
  sql,
  redis,
  storage,
  log,
  fetchImpl: graph.fetchImpl,
};
const alert = createAlerter(undefined, log);
const metaFactory = createMetaFactory(workerCtx, alert);

/** Worker embutido: o que a API enfileira roda antes da resposta voltar. */
const queues: Queues = {
  async enqueueSync(connectionId) {
    await runSync(workerCtx, metaFactory, alert, { connectionId });
    return { job_id: `sync-${connectionId}`, queue: 'adpub.sync' };
  },
  async enqueueImportDrive(input) {
    // Mesmo padrão do sync/analysis: o harness roda o worker embutido, então a
    // tela acompanha o resultado real sem rede.
    try {
      await runDriveImport(workerCtx, { ...input, actorId: input.actorId ?? null });
    } catch {
      /* job falho: como o BullMQ faria */
    }
    return { job_id: `drive-${input.jobId}`, queue: 'adpub.drive-import' };
  },
  async enqueueAnalysis(jobId) {
    // A9: o harness roda o worker embutido — mesma função que a fila chama.
    await runAnalysis(workerCtx, deps.ai, { jobId });
    return { job_id: `analysis-${jobId}`, queue: 'adpub.analysis' };
  },
  async enqueueInsights(input: { adAccountId: string; since: string; until: string }) {
    return { job_id: `insights-e2e-${input.adAccountId}-${input.since}`, queue: 'adpub.insights-sync' };
  },
  async queueCounts() {
    return {};
  },
  async enqueuePublish(items) {
    const refs: JobRef[] = [];
    for (const item of items) {
      await runPublish(workerCtx, metaFactory, alert, item, 1);
      refs.push({ job_id: `draft-${item.draftId}`, queue: 'adpub.publish' });
    }
    return refs;
  },
  async publishJobAlive() {
    // Fila inline: quando a chamada volta, o job já rodou.
    return false;
  },
  async close() {
    /* nada a fechar: o worker roda inline */
  },
};

const deps: ApiDeps = {
  db,
  storage,
  queues,
  env: {
    authSecret: env.AUTH_SECRET,
    allowedDomain: env.AUTH_ALLOWED_DOMAIN,
    metaApiVersion: env.META_API_VERSION,
    metaTier: env.META_TIER,
    // Classificação de política por IA fica desligada: o e2e não fala com a Anthropic.
    usePolicyAi: false,
    featureAiAnalysis: true,
    featureReports: true,
    featureInsights: true,
  },
  async metaClientFor() {
    return metaClientForToken(FAKE_META_TOKEN);
  },
  metaClientForToken,
};

function metaClientForToken(token: string): MetaClient {
  return new MetaClient({
    version: env.META_API_VERSION,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    token,
    fetchImpl: graph.fetchImpl,
  });
}

const app = await buildApp(deps, { logger: false });

await storage.ensureBucket();
await truncateAllTables(db, env.DATABASE_URL);

const connection = await createConnection(db, {
  businessId: BUSINESS_ID,
  label: CONNECTION_LABEL,
  token: FAKE_META_TOKEN,
  scopes: ['ads_management', 'business_management'],
  apiTier: 'limited',
});

const admin = await createUser(db, {
  email: `admin@${env.AUTH_ALLOWED_DOMAIN}`,
  name: 'Admin E2E',
  role: 'admin',
  passwordHash: hashPassword('e2e-admin-senha-0123456789'),
});
const token = await mintSessionToken(
  { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  env.AUTH_SECRET,
);
const auth = { authorization: `Bearer ${token}` };

/** Chama a própria API pelo caminho real de rota/validação, sem socket. */
async function seedCall<T>(
  method: 'POST' | 'GET',
  url: string,
  payload: unknown,
  expected: number,
): Promise<T> {
  const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
  if (response.statusCode !== expected) {
    throw new Error(`Seed falhou em ${method} ${url}: ${response.statusCode} ${response.body}`);
  }
  return response.json() as T;
}

// US1: sincroniza a BM falsa — traz conta, página, Instagram e pixel.
await seedCall('POST', `/api/v1/connections/${connection.id}/sync`, undefined, 202);

const client = await seedCall<{ id: string }>(
  'POST',
  '/api/v1/clients',
  {
    name: CLIENT_NAME,
    landing_domains: [LANDING_DOMAIN],
    default_utm: { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'inverno' },
    policy_mode: 'warn',
    voice_profile: {
      tone: 'direto, urgência leve',
      audience: 'mulheres 25-45',
      forbidden_terms: ['barato'],
      allowed_claims: [],
      examples: [],
    },
  },
  201,
);

await updateAccountDefaults(db, AD_ACCOUNT_ID, {
  client_id: client.id,
  default_page_id: PAGE_ID,
  default_ig_user_id: IG_ID,
  default_pixel_id: PIXEL_ID,
  daily_ad_cap: DAILY_AD_CAP,
});

/**
 * Segunda conta da mesma BM, só para a jornada de conferência pendente: o teto
 * diário é por conta e a jornada 5 confere o saldo da conta principal.
 */
await upsertAccounts(db, connection.id, [
  {
    id: REVIEW_ACCOUNT_ID,
    name: REVIEW_ACCOUNT_NAME,
    currency: 'BRL',
    timezoneName: 'America/Sao_Paulo',
    accountStatus: 1,
  },
]);
await setAccountPages(db, REVIEW_ACCOUNT_ID, [PAGE_ID]);
await updateAccountDefaults(db, REVIEW_ACCOUNT_ID, {
  client_id: client.id,
  default_page_id: PAGE_ID,
  default_ig_user_id: IG_ID,
  default_pixel_id: PIXEL_ID,
  daily_ad_cap: DAILY_AD_CAP,
});

const jpeg = await sharp({
  create: { width: 1200, height: 1200, channels: 3, background: '#1d4ed8' },
})
  .jpeg({ quality: 80 })
  .toBuffer();

const fixture = await tempFileFromBytes({
  filename: ASSET_FILENAME,
  bytes: new Uint8Array(jpeg),
  mime: 'image/jpeg',
});
const ingested = await ingestFile(
  { db, storage },
  {
    clientId: client.id,
    file: fixture.file,
    source: 'upload',
    actor: { id: admin.id, email: admin.email },
  },
);
await fixture.cleanup();
if (ingested.asset.validation.status !== 'ok') {
  throw new Error(`Criativo do seed reprovado: ${JSON.stringify(ingested.asset.validation)}`);
}

// Só agora o copiloto entra: o invoker devolve um plano fixo com o criativo semeado.
const planInvoker = fakeAiInvoker(ingested.asset.id);
// A contabilidade roda no e2e como em produção (só o provedor é falso): o
// caminho `ai_usage` precisa ser exercitado, senão a conta do custo só é
// testada em unidade.
deps.ai = new AiClient({
  invoke: trackedInvoker(
    (async (request: { toolName: string }) => {
      if (request.toolName === 'submit_content_analysis') {
        return { input: fakeAnalysisPayload(), inputTokens: 900, outputTokens: 200 };
      }
      if (request.toolName === 'submit_analysis_report') {
        return {
          input: {
            performance_findings: [],
            content_observations: [],
            hypotheses: [],
            recommended_tests: [],
            limitations: ['sem dados no período'],
          },
          inputTokens: 10,
          outputTokens: 10,
        };
      }
      return planInvoker();
    }) as never,
    (event) =>
      saveAiUsage(db, {
        ...event,
        clientId: event.attribution?.clientId ?? null,
        batchId: event.attribution?.batchId ?? null,
        assetId: event.attribution?.assetId ?? null,
      }),
  ),
  models: { generation: 'claude-sonnet-4-6', classify: 'claude-haiku-4-6' },
  // Mesmo cache de produção: a jornada de publicar precisa fechar o ciclo do
  // plano (`used`/`edited`) e o de regenerar precisa marcar `rejected`.
  cache: aiCacheFor(deps, null),
});

const seed: SeedData = {
  admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  connection: { id: connection.id, label: CONNECTION_LABEL, businessId: BUSINESS_ID, apiTier: 'full' },
  client: { id: client.id, name: CLIENT_NAME, landingDomain: LANDING_DOMAIN, utmSource: 'facebook' },
  account: {
    id: AD_ACCOUNT_ID,
    name: AD_ACCOUNT_NAME,
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    pageId: PAGE_ID,
    igUserId: IG_ID,
    pixelId: PIXEL_ID,
    dailyAdCap: DAILY_AD_CAP,
  },
  reviewAccount: { id: REVIEW_ACCOUNT_ID, name: REVIEW_ACCOUNT_NAME },
  asset: { id: ingested.asset.id, filename: ASSET_FILENAME },
  landing: LANDING,
};

await mkdir(dirname(SEED_FILE), { recursive: true });
await writeFile(SEED_FILE, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');

async function shutdown(signal: string): Promise<void> {
  await app.close();
  redis.disconnect();
  await sql.end({ timeout: 5 });
  console.log(`E2E_API encerrada por ${signal}`);
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}

await app.listen({ port: env.API_PORT, host: '127.0.0.1' });
console.log(`E2E_API_READY http://127.0.0.1:${env.API_PORT} admin=${admin.email}`);
