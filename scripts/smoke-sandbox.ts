/**
 * Fumaça em conta sandbox (Constituição V, T096): sobe 2 anúncios de imagem
 * PAUSED numa conta de teste **pelo pipeline real** (API → validação → fila →
 * worker → Graph API) e arquiva o que criou no fim, inclusive se algo falhar.
 *
 * Nenhuma escrita fora do pipeline (Constituição I): o script só publica
 * enfileirando o mesmo job que a UI enfileira. O arquivamento no teardown usa
 * `archiveAd`/`archiveCampaign`, que existem exclusivamente para esta limpeza.
 *
 * Pré-requisitos: infra local de pé (`infra/docker-compose.yml`), migrações
 * aplicadas (`pnpm db:migrate`) e um System User com acesso à conta de teste.
 *
 *   SMOKE_META_TOKEN=EAA...            # token do System User
 *   SMOKE_BUSINESS_ID=1789...          # BM dona da conta
 *   SMOKE_AD_ACCOUNT_ID=act_123        # conta de TESTE (orçamento zero)
 *   [SMOKE_PAGE_ID=1020304]            # padrão: primeira página elegível
 *   [SMOKE_LINK=https://exemplo.com.br/smoke]
 *   pnpm smoke:sandbox
 *
 * ATENÇÃO: apaga os dados do banco apontado por DATABASE_URL.
 */
import { buildApp } from '@adpub/api/app';
import type { ApiDeps, JobRef, Queues } from '@adpub/api/lib/deps';
import { ingestFile, tempFileFromBytes } from '@adpub/assets';
import { mintSessionToken } from '@adpub/auth';
import { loadServerEnv } from '@adpub/config';
import { mask } from '@adpub/crypto';
import {
  createConnection,
  createDb,
  getAccount,
  listAccountPageIds,
  listDraftsOfBatch,
  truncateAllTables,
  updateAccountDefaults,
  upsertUserFromLogin,
} from '@adpub/db';
import { MetaClient, getAdsStatus } from '@adpub/meta-client';
import { archiveAd, archiveCampaign } from '@adpub/meta-client/write';
import { Storage } from '@adpub/storage';
import { createAlerter, telegramFromEnv } from '@adpub/worker/alerts';
import type { WorkerContext } from '@adpub/worker/context';
import { createMetaFactory } from '@adpub/worker/meta';
import { runPublish } from '@adpub/worker/publish/pipeline';
import { runSync } from '@adpub/worker/sync/connection';
import { Redis } from 'ioredis';
import pino from 'pino';
import sharp from 'sharp';

interface SmokeEnv {
  token: string;
  businessId: string;
  adAccountId: string;
  pageId: string | null;
  link: string;
}

function smokeEnv(): SmokeEnv {
  const token = process.env.SMOKE_META_TOKEN;
  const businessId = process.env.SMOKE_BUSINESS_ID;
  const rawAccount = process.env.SMOKE_AD_ACCOUNT_ID;
  const missing = [
    ['SMOKE_META_TOKEN', token],
    ['SMOKE_BUSINESS_ID', businessId],
    ['SMOKE_AD_ACCOUNT_ID', rawAccount],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (!token || !businessId || !rawAccount) {
    console.error(
      `Faltam variáveis para a fumaça em sandbox: ${missing.join(', ')}.\n` +
        'Use uma conta de anúncio de TESTE: o script cria anúncios PAUSED de verdade e os arquiva.',
    );
    process.exit(1);
  }

  return {
    token,
    businessId,
    adAccountId: rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`,
    pageId: process.env.SMOKE_PAGE_ID ?? null,
    link: process.env.SMOKE_LINK ?? 'https://exemplo.com.br/smoke',
  };
}

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FALHA ${label}`);
  if (detail !== undefined)
    console.error('       ', JSON.stringify(detail, null, 2).slice(0, 1500));
}

/**
 * SC-006: o erro da Meta devolve o token cru ("Malformed access token EAA…") e
 * este script roda em CI. Tudo que sai — console, log estruturado e o erro
 * fatal — passa por este scrubber com os segredos trocados por `mask()`.
 */
function makeScrubber(secrets: readonly string[]): (text: string) => string {
  const alvos = secrets.filter((secret) => secret.length >= 8);
  return (text) => {
    let out = text;
    for (const secret of alvos) out = out.split(secret).join(mask(secret));
    return out;
  };
}

let scrub: (text: string) => string = (text) => text;

function scrubConsole(): void {
  for (const nome of ['log', 'error', 'warn'] as const) {
    const original = console[nome].bind(console);
    console[nome] = (...args: unknown[]) => {
      original(
        ...args.map((arg) => {
          if (arg instanceof Error) return scrub(arg.stack ?? arg.message);
          return typeof arg === 'string' ? scrub(arg) : arg;
        }),
      );
    };
  }
}

async function main(): Promise<void> {
  const smoke = smokeEnv();
  const env = loadServerEnv();
  scrub = makeScrubber([smoke.token, env.META_APP_SECRET, env.MASTER_KEY]);
  scrubConsole();
  const log = pino(
    { level: env.LOG_LEVEL ?? 'warn' },
    { write: (line: string) => process.stdout.write(scrub(line)) },
  );
  const { db, sql } = createDb(env.DATABASE_URL, { max: 4, onNotice: () => {} });
  const storage = new Storage({
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
  });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const workerCtx: WorkerContext = { env, db, sql, redis, storage, log };
  const alert = createAlerter(telegramFromEnv(env), log);
  const metaFactory = createMetaFactory(workerCtx, alert);
  /** Cliente usado só para conferir status e arquivar no teardown. */
  const cleanupClient = new MetaClient({
    version: env.META_API_VERSION,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    baseUrl: env.META_BASE_URL,
    token: smoke.token,
    adAccountId: smoke.adAccountId,
  });

  const createdAdIds: string[] = [];
  const createdCampaignIds: string[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  await storage.ensureBucket();
  await truncateAllTables(db, env.DATABASE_URL);

  const queues: Queues = {
    async enqueueSync(connectionId) {
      await runSync(workerCtx, metaFactory, alert, { connectionId });
      return { job_id: `sync-${connectionId}`, queue: 'adpub.sync' };
    },
    async enqueueAnalysis() {
      throw new Error('Análise de mídia não faz parte da fumaça em sandbox.');
    },
    async enqueueImportDrive() {
      throw new Error('Importação do Drive não faz parte da fumaça em sandbox.');
    },
    async enqueueInsights() {
      throw new Error('Sync de Insights não faz parte da fumaça em sandbox.');
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
    async close() {
      /* filas rodam inline */
    },
  };

  function metaClientForToken(rawToken: string): MetaClient {
    return new MetaClient({
      version: env.META_API_VERSION,
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      baseUrl: env.META_BASE_URL,
      token: rawToken,
    });
  }

  const deps: ApiDeps = {
    db,
    storage,
    queues,
    env: {
      authSecret: env.AUTH_SECRET,
      allowedDomain: env.AUTH_ALLOWED_DOMAIN,
      metaApiVersion: env.META_API_VERSION,
      metaTier: env.META_TIER,
      usePolicyAi: false,
      featureAiAnalysis: true,
      featureReports: true,
      featureInsights: true,
    },
    metaClientFor: async () => metaClientForToken(smoke.token),
    metaClientForToken,
  };

  const app = await buildApp(deps, { logger: false });

  try {
    console.log('▸ Conectando a BM e sincronizando a conta de teste');
    const connection = await createConnection(db, {
      businessId: smoke.businessId,
      label: `Fumaça sandbox ${stamp}`,
      token: smoke.token,
      scopes: ['ads_management', 'business_management'],
      apiTier: env.META_TIER,
    });
    await runSync(workerCtx, metaFactory, alert, { connectionId: connection.id });

    const account = await getAccount(db, smoke.adAccountId);
    check('conta de teste sincronizada', Boolean(account), smoke.adAccountId);
    if (!account)
      throw new Error(
        `Conta ${smoke.adAccountId} não veio no sync — confira as permissões do System User.`,
      );

    const admin = await upsertUserFromLogin(db, {
      email: `smoke@${env.AUTH_ALLOWED_DOMAIN}`,
      name: 'Fumaça Sandbox',
      googleSub: `smoke-${stamp}`,
    });
    const auth = {
      authorization: `Bearer ${await mintSessionToken(
        { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
        env.AUTH_SECRET,
      )}`,
    };

    const eligiblePages = await listAccountPageIds(db, smoke.adAccountId);
    const pageId = smoke.pageId ?? eligiblePages[0] ?? account.defaultPageId;
    check('página elegível disponível', Boolean(pageId), eligiblePages);
    if (!pageId) throw new Error('Nenhuma página elegível na conta: defina SMOKE_PAGE_ID.');

    console.log('▸ Preparando cliente, padrões e criativo');
    const linkHost = new URL(smoke.link).hostname;
    const client = (await app
      .inject({
        method: 'POST',
        url: '/api/v1/clients',
        headers: auth,
        payload: {
          name: `Fumaça Sandbox ${stamp}`,
          landing_domains: [linkHost],
          default_utm: { utm_source: 'adpub', utm_medium: 'smoke' },
          policy_mode: 'warn',
        },
      })
      .then((r) => r.json())) as { id: string };

    await updateAccountDefaults(db, smoke.adAccountId, {
      client_id: client.id,
      default_page_id: pageId,
      daily_ad_cap: 2,
    });

    const bytes = new Uint8Array(
      await sharp({ create: { width: 1200, height: 1200, channels: 3, background: '#0f172a' } })
        .jpeg({ quality: 80 })
        .toBuffer(),
    );
    const fixture = await tempFileFromBytes({
      filename: `adpub-smoke-${stamp}.jpg`,
      bytes,
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
    check(
      'criativo aprovado na validação de mídia',
      ingested.asset.validation.status === 'ok',
      ingested.asset.validation,
    );

    console.log('▸ Montando o lote pelo construtor manual e validando');
    const batch = (await app
      .inject({
        method: 'POST',
        url: '/api/v1/batches',
        headers: auth,
        payload: {
          client_id: client.id,
          ad_account_id: smoke.adAccountId,
          name: `AdPub SMOKE ${stamp}`,
          mode: 'manual',
        },
      })
      .then((r) => r.json())) as { id: string };

    const copy = (variant: string) => ({
      primary_text: `Fumaça AdPub (${variant}): anúncio de teste, nasce pausado e é arquivado em seguida.`,
      headline: 'Teste de fumaça AdPub',
      description: 'Ambiente de teste',
      cta: 'LEARN_MORE',
      link: smoke.link,
    });

    // Construtor manual (FR-008): o mesmo BatchPlan que a IA produziria, sem IA.
    const planned = await app.inject({
      method: 'PUT',
      url: `/api/v1/batches/${batch.id}/plan`,
      headers: auth,
      payload: {
        campaigns: [
          {
            key: 'smoke-campanha',
            name: `AdPub SMOKE ${stamp}`,
            objective: 'OUTCOME_TRAFFIC',
            buying_type: 'AUCTION',
            special_ad_categories: [],
            daily_budget_cents: 10_000,
          },
        ],
        adsets: [
          {
            key: 'smoke-conjunto',
            campaign_key: 'smoke-campanha',
            name: `AdPub SMOKE conjunto ${stamp}`,
            optimization_goal: 'LINK_CLICKS',
            billing_event: 'IMPRESSIONS',
            advantage_audience: true,
            daily_budget_cents: 10_000,
          },
        ],
        items: [
          {
            format: 'single_image',
            asset_ids: [ingested.asset.id],
            campaign_ref: { kind: 'new', key: 'smoke-campanha' },
            adset_ref: { kind: 'new', key: 'smoke-conjunto' },
            copies: [copy('v1'), copy('v2')],
            page_id: pageId,
          },
        ],
        pending: [],
        notes: 'Fumaça em sandbox.',
      },
    });
    check('plano manual gerou 2 itens', planned.statusCode === 200, planned.json());
    if (planned.statusCode !== 200) throw new Error('Plano manual recusado pela API.');

    const report = (await app
      .inject({ method: 'POST', url: `/api/v1/batches/${batch.id}/validate`, headers: auth })
      .then((r) => r.json())) as { can_publish: boolean; items: unknown[] };
    check('validação liberou a publicação', report.can_publish === true, report);
    if (!report.can_publish) throw new Error('Validação bloqueou o lote de fumaça.');

    console.log('▸ Publicando pelo pipeline (tudo PAUSED)');
    const publish = (await app
      .inject({
        method: 'POST',
        url: `/api/v1/batches/${batch.id}/publish`,
        headers: auth,
        payload: { confirm_count: 2, only_failed: false },
      })
      .then((r) => r.json())) as { queued: number };
    check('2 itens enfileirados', publish.queued === 2, publish);

    const drafts = await listDraftsOfBatch(db, batch.id);
    for (const draft of drafts) {
      const ids = draft.metaIds;
      if (ids.ad_id) createdAdIds.push(ids.ad_id);
      if (ids.campaign_id && !createdCampaignIds.includes(ids.campaign_id)) {
        createdCampaignIds.push(ids.campaign_id);
      }
    }
    check(
      'todos os itens publicados',
      drafts.every((draft) => draft.status === 'published'),
      drafts.map((draft) => ({ id: draft.id, status: draft.status, error: draft.error })),
    );
    check('2 anúncios criados na Meta', createdAdIds.length === 2, createdAdIds);

    if (createdAdIds.length > 0) {
      const statuses = await getAdsStatus(cleanupClient, createdAdIds);
      const naoPausados = statuses.filter((ad) => ad.configured_status !== 'PAUSED');
      check('SC-007: nenhum anúncio ativo', naoPausados.length === 0, statuses);
    }
  } finally {
    console.log('▸ Arquivando o que foi criado');
    for (const adId of createdAdIds) {
      try {
        await archiveAd(cleanupClient, adId);
        console.log(`  anúncio ${adId} arquivado`);
      } catch (error) {
        failures += 1;
        console.error(`  FALHA ao arquivar o anúncio ${adId}:`, error);
      }
    }
    for (const campaignId of createdCampaignIds) {
      try {
        await archiveCampaign(cleanupClient, campaignId);
        console.log(`  campanha ${campaignId} arquivada`);
      } catch (error) {
        failures += 1;
        console.error(`  FALHA ao arquivar a campanha ${campaignId}:`, error);
      }
    }
    await app.close();
    redis.disconnect();
    await sql.end({ timeout: 5 });
  }

  if (failures > 0) {
    console.error(`\nFUMAÇA SANDBOX FALHOU: ${failures} verificação(ões).`);
    process.exit(1);
  }
  console.log('\nFUMAÇA SANDBOX OK — 2 anúncios PAUSED criados pelo pipeline e arquivados.');
}

try {
  await main();
} catch (error) {
  // O handler padrão do Node imprimiria a mensagem crua da Meta (com o token).
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
}
