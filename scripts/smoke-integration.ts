/**
 * Smoke de integração (Constituição V): exercita o caminho real — API HTTP →
 * validação → fila → pipeline → Graph API — contra Postgres/Redis/MinIO locais
 * e uma Graph API falsa. Nenhuma chamada sai para a Meta.
 *
 *   docker compose -f infra/docker-compose.yml up -d
 *   pnpm db:migrate && pnpm smoke:integration
 *
 * ATENÇÃO: apaga os dados do banco apontado por DATABASE_URL.
 */
import { AiClient } from '@adpub/ai';
import { ingestFile } from '@adpub/assets';
import { QUEUES, RETRY, loadServerEnv } from '@adpub/config';
import { mintSessionToken } from '@adpub/auth';
import {
  activeBindingForDraft,
  createConnection,
  createDb,
  deleteDraftsOfBatch,
  getBatch,
  getAccount,
  getConnectionRow,
  claimDraft,
  getDraft,
  markDraftsQueued,
  listAudit,
  listDraftsOfBatch,
  setAccountPages,
  swapBatchPlan,
  transitionDraft,
  updateAccountDefaults,
  updateConnectionStatus,
  upsertAccounts,
  upsertInstagramAccounts,
  upsertPages,
  upsertPixels,
  truncateAllTables,
  upsertUserFromLogin,
  type DraftInsert,
} from '@adpub/db';
import {
  batchPlanSchema,
  copySchema,
  IN_FLIGHT_STATUSES,
  PUBLISHED_STATUSES,
  type AdDraftStatus,
  type BatchPlan,
} from '@adpub/shared';
import { MetaClient, MetaApiError, MetaTimeoutError } from '@adpub/meta-client';
import { Storage } from '@adpub/storage';
import { buildApp } from '@adpub/api/app';
import type { ApiDeps, JobRef, Queues } from '@adpub/api/lib/deps';
import { AccountAuthError, runPublish } from '@adpub/worker/publish/pipeline';
import { runInsightsSync } from '@adpub/worker/insights/sync';
import type { MetaFactory } from '@adpub/worker/meta';
import { runStatusPoll } from '@adpub/worker/poll/status';
import { runSync } from '@adpub/worker/sync/connection';
import { createAlerter } from '@adpub/worker/alerts';
import { createMetaFactory } from '@adpub/worker/meta';
import { createPublishProcessor } from '@adpub/worker/publish/handler';
import type { PublishJobData } from '@adpub/worker/publish/pipeline';
import { Queue, Worker } from 'bullmq';
import type { WorkerContext } from '@adpub/worker/context';
import { Redis } from 'ioredis';
import pino from 'pino';
import sharp from 'sharp';
import { createFakeGraph } from './lib/fake-graph.js';

const CLIENT_NAME = 'Loja Teste';
const AD_ACCOUNT_ID = 'act_1030000000001';
const PAGE_ID = '102030405060708';
const IG_ID = '17841400000000001';
const PIXEL_ID = '99887766554433';
const BLOCKING_STATUSES: readonly AdDraftStatus[] = [...IN_FLIGHT_STATUSES, ...PUBLISHED_STATUSES];
const LANDING = 'https://lojateste.com.br/inverno';

let failures = 0;
const started = Date.now();

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${label}`);
  if (detail !== undefined) console.error('       ', JSON.stringify(detail, null, 2).slice(0, 1200));
}

function phase(title: string): void {
  console.log(`\n▸ ${title}`);
}

/** Falha ruidosamente quando a API responde fora do esperado. */
function expect<T>(label: string, response: { statusCode: number; json: () => unknown }, status: number): T {
  if (response.statusCode !== status) {
    failures += 1;
    console.error(`  FAIL ${label}: esperado ${status}, veio ${response.statusCode}`);
    console.error('       ', JSON.stringify(response.json(), null, 2).slice(0, 1500));
    throw new Error(`${label}: HTTP ${response.statusCode}`);
  }
  return response.json() as T;
}

/** Plano fixo devolvido pela IA falsa: 1 campanha, 1 conjunto, 1 criativo × 2 copies. */
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
      notes: 'Plano do smoke.',
    },
    inputTokens: 1200,
    outputTokens: 800,
  });
}

async function main(): Promise<void> {
  const env = loadServerEnv();
  const { db, sql } = createDb(env.DATABASE_URL, { max: 4, onNotice: () => {} });
  const storage = new Storage({
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
  });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const graph = createFakeGraph();
  const log = pino({ level: 'warn' });

  phase('Preparando banco, storage e conexão');
  await storage.ensureBucket();
  await truncateAllTables(db, env.DATABASE_URL);

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

  const publishedDrafts: string[] = [];
  const queues: Queues = {
    async enqueueSync(connectionId) {
      await runSync(workerCtx, metaFactory, alert, { connectionId });
      return { job_id: `sync-${connectionId}`, queue: 'adpub.sync' };
    },
    async enqueueImportDrive() {
      return { job_id: 'drive-1', queue: 'adpub.drive-import' };
    },
    async enqueuePublish(items) {
      const refs: JobRef[] = [];
      for (const item of items) {
        // No BullMQ o produtor só enfileira: uma falha do worker não sobe para
        // quem chamou `POST /publish`, o job é reagendado. O stub roda o
        // worker inline, então precisa engolir o erro do mesmo jeito.
        try {
          await runPublish(workerCtx, metaFactory, alert, item, 1);
        } catch {
          /* job falho: reprocessado adiante, como o BullMQ faria */
        }
        publishedDrafts.push(item.draftId);
        refs.push({ job_id: `draft-${item.draftId}`, queue: 'adpub.publish' });
      }
      return refs;
    },
    async enqueueInsights(input) {
      try {
        await runInsightsSync(workerCtx, metaFactory, alert, input);
      } catch {
        /* job falho: como o BullMQ faria */
      }
      return { job_id: `insights-${input.adAccountId}-${input.since}`, queue: 'adpub.insights-sync' };
    },
    async queueCounts() {
      return {};
    },
    async close() {
      /* nada a fechar no smoke */
    },
  };

  const connection = await createConnection(db, {
    businessId: '1789000000000001',
    label: 'BM principal (smoke)',
    token: 'EAA-token-de-smoke-nao-real-0123456789',
    scopes: ['ads_management', 'business_management'],
    apiTier: 'limited',
  });

  const admin = await upsertUserFromLogin(db, {
    email: `admin@${env.AUTH_ALLOWED_DOMAIN}`,
    name: 'Admin Smoke',
    googleSub: 'google-sub-smoke',
  });
  check('primeiro usuário do domínio nasce admin', admin.role === 'admin', admin.role);
  const token = await mintSessionToken(
    { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    env.AUTH_SECRET,
  );
  const auth = { authorization: `Bearer ${token}` };

  function metaClientForToken(rawToken: string): MetaClient {
    return new MetaClient({
      version: env.META_API_VERSION,
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      token: rawToken,
      fetchImpl: graph.fetchImpl,
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
    metaClientFor: async () => metaClientForToken('EAA-token-de-smoke-nao-real-0123456789'),
    metaClientForToken,
  };

  const app = await buildApp(deps, { logger: false });

  phase('US6 — sessão e RBAC');
  const noAuth = await app.inject({ method: 'GET', url: '/api/v1/ad-accounts' });
  check('rota protegida sem sessão devolve 401', noAuth.statusCode === 401, noAuth.json());
  check(
    'erro segue problem+json',
    noAuth.headers['content-type']?.toString().includes('application/problem+json') === true,
    noAuth.headers['content-type'],
  );

  phase('US1 — sincronizar a BM');
  const syncResponse = await app.inject({
    method: 'POST',
    url: `/api/v1/connections/${connection.id}/sync`,
    headers: auth,
  });
  check('sync enfileirado (202)', syncResponse.statusCode === 202, syncResponse.json());
  const accounts = await app
    .inject({ method: 'GET', url: '/api/v1/ad-accounts', headers: auth })
    .then((r) => r.json() as Array<{ id: string; name: string; ads_manager_url: string }>);
  check('conta sincronizada aparece na listagem', accounts.some((a) => a.id === AD_ACCOUNT_ID), accounts);
  check(
    'link para o Gerenciador de Anúncios montado',
    accounts[0]?.ads_manager_url.includes('act=1030000000001') === true,
    accounts[0]?.ads_manager_url,
  );

  phase('US2 — cliente, defaults e criativo');
  const client = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: auth,
      payload: {
        name: CLIENT_NAME,
        landing_domains: ['lojateste.com.br'],
        default_utm: { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'inverno' },
        policy_mode: 'block',
        voice_profile: {
          tone: 'direto, urgência leve',
          audience: 'mulheres 25-45',
          forbidden_terms: ['barato'],
          allowed_claims: [],
          examples: [],
        },
      },
    })
    .then((r) => r.json())) as { id: string; name: string };
  check('cliente criado', Boolean(client.id), client);

  await updateAccountDefaults(db, AD_ACCOUNT_ID, {
    client_id: client.id,
    default_page_id: PAGE_ID,
    default_ig_user_id: IG_ID,
    default_pixel_id: PIXEL_ID,
    daily_ad_cap: 3,
  });

  const png = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: '#1d4ed8' },
  })
    .jpeg({ quality: 80 })
    .toBuffer();

  const ingested = await ingestFile(
    { db, storage },
    {
      clientId: client.id,
      file: { filename: 'inverno-01.jpg', bytes: new Uint8Array(png), mime: 'image/jpeg' },
      source: 'upload',
      actor: { id: admin.id, email: admin.email },
    },
  );
  check('criativo aprovado na validação de mídia', ingested.asset.validation.status === 'ok', ingested.asset.validation);
  check('proporção 1:1 detectada', ingested.asset.aspectRatio === '1:1', ingested.asset.aspectRatio);

  const dedupe = await ingestFile(
    { db, storage },
    {
      clientId: client.id,
      file: { filename: 'inverno-01-copia.jpg', bytes: new Uint8Array(png), mime: 'image/jpeg' },
      source: 'upload',
    },
  );
  check('dedupe por sha256 reaproveita o criativo', dedupe.reused && dedupe.asset.id === ingested.asset.id, {
    reused: dedupe.reused,
  });

  phase('US3 — briefing → plano de IA → itens');
  deps.ai = new AiClient({
    invoke: fakeAiInvoker(ingested.asset.id),
    models: { generation: 'claude-sonnet-4-6', classify: 'claude-haiku-4-6' },
  });

  const batch = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/batches',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: AD_ACCOUNT_ID,
        name: 'Inverno - Semana 2',
        mode: 'ai',
        briefing: 'Vendas no site, 20% OFF na coleção de inverno, cupom INVERNO20.',
      },
    })
    .then((r) => r.json())) as { id: string };
  check('lote criado', Boolean(batch.id), batch);

  const planned = expect<{
    items: Array<{ id: string; name: string; status: string; copy: { url_tags: string } }>;
    pending: string[];
  }>(
    'plano gerado',
    await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${batch.id}/plan`,
      headers: auth,
      payload: { asset_ids: [ingested.asset.id], copies_per_creative: 2 },
    }),
    200,
  );
  check('plano gerou 2 itens (1 criativo × 2 copies)', planned.items.length === 2, planned.items?.length);
  check('nomenclatura preenchida automaticamente', Boolean(planned.items[0]?.name), planned.items[0]?.name);
  check(
    'UTMs do cliente aplicadas',
    planned.items[0]?.copy.url_tags.includes('utm_source=facebook') === true,
    planned.items[0]?.copy.url_tags,
  );
  check('pendência do plano exposta na UI', planned.pending.length === 1, planned.pending);

  phase('FR-008 — construtor manual entrega o mesmo BatchPlan');
  const manualBatch = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/batches',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: AD_ACCOUNT_ID,
        name: 'Inverno - manual',
        mode: 'manual',
      },
    })
    .then((r) => r.json())) as { id: string };

  const manualCopy = (variant: string) => ({
    primary_text: `Coleção de inverno com 20% OFF (${variant}). Cupom INVERNO20.`,
    headline: 'Inverno com 20% OFF',
    description: 'Frete grátis acima de R$ 199',
    cta: 'SHOP_NOW',
    link: LANDING,
  });

  const manualPlan = {
    campaigns: [
      {
        key: 'manual-c1',
        name: 'Loja Teste_trafego_manual',
        objective: 'OUTCOME_TRAFFIC',
        buying_type: 'AUCTION',
        special_ad_categories: [],
        daily_budget_cents: 5_000,
      },
    ],
    adsets: [
      {
        key: 'manual-a1',
        campaign_key: 'manual-c1',
        name: 'Manual - Advantage+',
        optimization_goal: 'LINK_CLICKS',
        billing_event: 'IMPRESSIONS',
        advantage_audience: true,
      },
    ],
    items: [
      {
        format: 'single_image',
        asset_ids: [ingested.asset.id],
        campaign_ref: { kind: 'new', key: 'manual-c1' },
        adset_ref: { kind: 'new', key: 'manual-a1' },
        copies: [manualCopy('a'), manualCopy('b')],
        page_id: PAGE_ID,
      },
    ],
    pending: [],
    notes: 'Montado no formulário.',
  };

  const manual = expect<{ items: Array<{ name: string; status: string; copy: { url_tags: string } }> }>(
    'plano manual salvo',
    await app.inject({
      method: 'PUT',
      url: `/api/v1/batches/${manualBatch.id}/plan`,
      headers: auth,
      payload: manualPlan,
    }),
    200,
  );
  check('formulário gera 2 itens (1 criativo × 2 copies)', manual.items.length === 2, manual.items.length);
  check('itens do formulário nascem prontos', manual.items.every((item) => item.status === 'ready'), manual.items.map((i) => i.status));
  check(
    'nomenclatura e UTM aplicadas no caminho manual',
    manual.items.every((item) => item.name.length > 0 && item.copy.url_tags.includes('utm_source=facebook')),
    manual.items.map((item) => ({ name: item.name, url_tags: item.copy.url_tags })),
  );

  const orfao = await app.inject({
    method: 'PUT',
    url: `/api/v1/batches/${manualBatch.id}/plan`,
    headers: auth,
    payload: {
      ...manualPlan,
      campaigns: [],
      items: [{ ...manualPlan.items[0], adset_ref: { kind: 'existing', id: graph.ids.adset } }],
    },
  });
  check('ref nova sem especificação é recusada antes da fila', orfao.statusCode === 422, orfao.json());
  check(
    'erro aponta a campanha órfã',
    JSON.stringify(orfao.json()).includes('manual-c1'),
    orfao.json(),
  );

  phase('US4 — validação bloqueia antes da Meta');
  const second = planned.items[1];
  if (!second) throw new Error('smoke sem segundo item');
  const blockedItem = second.id;
  const blockedCopy = second.copy;
  const patched = await app.inject({
    method: 'PATCH',
    url: `/api/v1/batches/${batch.id}/items/${blockedItem}`,
    headers: auth,
    payload: { copy: { ...blockedCopy, link: 'https://dominio-nao-permitido.com/x' } },
  });
  check('item editado', patched.statusCode === 200, patched.json());

  const report = (await app
    .inject({ method: 'POST', url: `/api/v1/batches/${batch.id}/validate`, headers: auth })
    .then((r) => r.json())) as {
    can_publish: boolean;
    items: Array<{ item_id: string; status: string; errors: Array<{ code: string }> }>;
  };
  check('lote com link fora do domínio não pode publicar', report.can_publish === false, report.can_publish);
  const blockedReport = report.items.find((item) => item.item_id === blockedItem);
  check(
    'erro aponta o domínio inválido',
    blockedReport?.errors.some((error) => error.code === 'copy.link_domain') === true,
    blockedReport?.errors,
  );

  const publishBlocked = await app.inject({
    method: 'POST',
    url: `/api/v1/batches/${batch.id}/publish`,
    headers: auth,
    payload: { confirm_count: 2, only_failed: false },
  });
  check('publicação recusa contagem divergente', publishBlocked.statusCode === 422, publishBlocked.json());

  // Restaura o link válido e revalida.
  await app.inject({
    method: 'PATCH',
    url: `/api/v1/batches/${batch.id}/items/${blockedItem}`,
    headers: auth,
    payload: { copy: { ...blockedCopy, link: LANDING } },
  });
  const report2 = (await app
    .inject({ method: 'POST', url: `/api/v1/batches/${batch.id}/validate`, headers: auth })
    .then((r) => r.json())) as { can_publish: boolean };
  check('após correção o lote libera publicação', report2.can_publish === true, report2);

  // T-000-3: edição após validar invalida a aprovação até revalidar.
  await app.inject({
    method: 'PATCH',
    url: `/api/v1/batches/${batch.id}/items/${blockedItem}`,
    headers: auth,
    payload: { copy: { ...blockedCopy, link: LANDING, headline: 'Título pós-validação' } },
  });
  const publishStale = await app.inject({
    method: 'POST',
    url: `/api/v1/batches/${batch.id}/publish`,
    headers: auth,
    payload: { confirm_count: 2, only_failed: false },
  });
  check('publicar após edição sem revalidar é recusado', publishStale.statusCode === 422, publishStale.json());
  const report3 = (await app
    .inject({ method: 'POST', url: `/api/v1/batches/${batch.id}/validate`, headers: auth })
    .then((r) => r.json())) as { can_publish: boolean };
  check('revalidar restaura a aprovação', report3.can_publish === true, report3);

  phase('US5 — publicar (tudo PAUSED, idempotente)');
  const publish = (await app
    .inject({
      method: 'POST',
      url: `/api/v1/batches/${batch.id}/publish`,
      headers: auth,
      payload: { confirm_count: 2, only_failed: false },
    })
    .then((r) => r.json())) as { queued: number; skipped: number; daily_remaining: number };
  check('2 itens enfileirados e publicados', publish.queued === 2, publish);
  check('teto diário respeitado no retorno', publish.daily_remaining === 1, publish);

  const detail = (await app
    .inject({ method: 'GET', url: `/api/v1/batches/${batch.id}`, headers: auth })
    .then((r) => r.json())) as {
    status: string;
    items: Array<{ status: string; meta_ids: Record<string, string>; ads_manager_url: string | null }>;
  };
  check('todos os itens publicados', detail.items.every((item) => item.status === 'published'), detail.items.map((i) => i.status));
  check('lote fechado como done', detail.status === 'done', detail.status);
  check(
    'IDs da Meta persistidos por item',
    detail.items.every((item) => item.meta_ids.ad_id === graph.ids.ad && item.meta_ids.creative_id === graph.ids.creative),
    detail.items.map((item) => item.meta_ids),
  );
  check('link direto para o anúncio disponível', Boolean(detail.items[0]?.ads_manager_url), detail.items[0]?.ads_manager_url);

  check('campanha nova criada uma única vez (lock de ref)', graph.count('POST act_1030000000001/campaigns') === 1, graph.calls);
  check('conjunto novo criado uma única vez', graph.count('POST act_1030000000001/adsets') === 1, graph.calls);
  check('imagem enviada uma única vez para a conta', graph.count('POST act_1030000000001/adimages') === 1, graph.calls);
  check('dois criativos e dois anúncios criados', graph.count('POST act_1030000000001/adcreatives') === 2 && graph.count('POST act_1030000000001/ads') === 2, graph.calls);

  phase('T-002 — variante imutável e vínculo observado');
  const variants = (await app
    .inject({ method: 'GET', url: `/api/v1/variants?client_id=${client.id}`, headers: auth })
    .then((r) => r.json())) as Array<{ id: string; manifest: { copy: { headline: string }; assetIds: string[] } }>;
  const publishedItems = (await listDraftsOfBatch(db, batch.id)).filter((i) => i.status === 'published');
  const publishedVariantIds = new Set(publishedItems.map((i) => i.variantId));
  check(
    '2 copies viram 2 variantes distintas',
    publishedItems.length === 2 && publishedVariantIds.size === 2 && ![...publishedVariantIds].includes(null),
    publishedItems.map((i) => i.variantId),
  );
  let vinculosOk = 0;
  for (const item of publishedItems) {
    const binding = await activeBindingForDraft(db, item.id);
    if (
      binding?.precision === 'confirmed' &&
      binding.metaAdId === item.metaIds?.ad_id &&
      binding.metaCreativeId === item.metaIds?.creative_id &&
      binding.variantId === item.variantId &&
      variants.some((v) => v.id === binding.variantId && v.manifest.assetIds.length === item.assetIds.length)
    ) {
      vinculosOk += 1;
    }
  }
  check('publish cria vínculo confirmed com composição completa', vinculosOk === 2, vinculosOk);

  // Vínculo manual para anúncio fora do app; nome repetido não auto-vincula.
  const manualBind = (headline: string, link: string, tag: string) => ({
    meta_ad_id: `9990000000000${tag}`,
    meta_creative_id: `9980000000000${tag}`,
    manifest: {
      format: 'single_image',
      assetIds: [ingested.asset.id],
      copy: { ...manualCopy('m'), headline, link },
      pageId: PAGE_ID,
      igUserId: null,
      offerContext: null,
    },
  });
  const bind = async (headline: string, link: string, tag: string) =>
    (await app
      .inject({
        method: 'POST',
        url: `/api/v1/ad-accounts/${AD_ACCOUNT_ID}/bindings`,
        headers: auth,
        payload: manualBind(headline, link, tag),
      })
      .then((r) => r.json())) as { variant_id: string; precision: string };
  const bind1 = await bind('Mesmo Nome', LANDING, '11');
  const bind2 = await bind('Mesmo Nome', LANDING, '22');
  const bind3 = await bind('Mesmo Nome', 'https://lojateste.com.br/verao', '33');
  check('vínculo manual criado', bind1.precision === 'manual' && bind2.precision === 'manual', bind1.precision);
  check('mesmo manifesto reutiliza a variante', bind1.variant_id === bind2.variant_id, bind1.variant_id);
  check('mesmo nome + conteúdo diferente é outra variante', bind3.variant_id !== bind1.variant_id, bind3.variant_id);

  phase('T-003 — CSV real vira observação sem inventar número');
  const csv = [
    'Nome do anúncio;Gasto (BRL);Impressões;Data de início;Data de término;ID do anúncio',
    `Anúncio A;1.234,56;10000;01/09/2026;01/09/2026;${graph.ids.ad}`,
    'Total da conta;1.234,56;10000;01/09/2026;07/09/2026;',
    'Anúncio sem compras;;;01/09/2026;01/09/2026;',
  ].join('\n');
  const boundary = '----smoke-relatorio';
  const part = (name: string, value: string | Buffer, filename?: string, type = 'text/plain'): Buffer => {
    const head = `--${boundary}\r\nContent-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"` : ''}\r\nContent-Type: ${type}\r\n\r\n`;
    return Buffer.concat([Buffer.from(head), Buffer.isBuffer(value) ? value : Buffer.from(value), Buffer.from('\r\n')]);
  };
  const contexto = JSON.stringify({
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    entity_level: 'ad',
    attribution: '7d_click',
    coverage: 'selected',
  });
  const corpo = Buffer.concat([
    part('client_id', client.id),
    part('context', contexto, undefined, 'application/json'),
    part('relatorio', Buffer.from(csv, 'utf8'), 'relatorio.csv', 'text/csv'),
    Buffer.from(`--${boundary}--\r\n`),
  ]);
  const subidoResp = await app.inject({
    method: 'POST',
    url: '/api/v1/report-imports',
    headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: corpo,
  });
  if (subidoResp.statusCode !== 201) {
    check('upload de CSV (201)', false, { status: subidoResp.statusCode, body: subidoResp.body.slice(0, 800) });
    throw new Error('upload de relatório falhou');
  }
  const subido = subidoResp.json() as {
    import_id: string;
    valid: number;
    invalid: number;
    unmapped: string[];
    rows: Array<{ status: string; observation: { adId: string | null; grain: string; metrics: Record<string, number> } | null }>;
  };
  check('prévia: 2 válidas + 1 total excluído', subido.valid === 2 && subido.invalid === 1, { valid: subido.valid, invalid: subido.invalid });
  check('sem coluna não-mapeada', subido.unmapped.length === 0, subido.unmapped);
  const linhaA = subido.rows[0]?.observation;
  check('decimal BR e ad_id exato', linhaA?.metrics.spend === 1234.56 && linhaA?.adId === graph.ids.ad, linhaA);
  check('sem compras = sem CPA inventado', subido.rows[2]?.observation?.metrics.primary_results === undefined, subido.rows[2]?.observation?.metrics);
  const commit1 = (await app
    .inject({ method: 'POST', url: `/api/v1/report-imports/${subido.import_id}/commit`, headers: auth })
    .then((r) => ({ status: r.statusCode, body: r.json() as { observations: number } })));
  check('commit grava 2 observações', commit1.status === 202 && commit1.body.observations === 2, commit1);
  const recommit = await app.inject({ method: 'POST', url: `/api/v1/report-imports/${subido.import_id}/commit`, headers: auth });
  check('recommit não dobra', (recommit.json() as { observations: number }).observations === 2, recommit.json());
  const redup = await app.inject({
    method: 'POST',
    url: '/api/v1/report-imports',
    headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: corpo,
  });
  const redupId = (redup.json() as { import_id: string }).import_id;
  const commitDup = await app.inject({ method: 'POST', url: `/api/v1/report-imports/${redupId}/commit`, headers: auth });
  check('re-upload confirmado dá 409', commitDup.statusCode === 409, commitDup.statusCode);

  const callsBefore = new Map(graph.calls);
  const first = publishedDrafts[0];
  if (!first) throw new Error('smoke sem item publicado');
  await runPublish(workerCtx, metaFactory, alert, { draftId: first, adAccountId: AD_ACCOUNT_ID, batchId: batch.id }, 2);
  check(
    'reprocessar item publicado não chama a Meta de novo',
    graph.count('POST act_1030000000001/ads') === callsBefore.get('POST act_1030000000001/ads'),
    { antes: callsBefore.get('POST act_1030000000001/ads'), depois: graph.count('POST act_1030000000001/ads') },
  );

  const republish = await app.inject({
    method: 'POST',
    url: `/api/v1/batches/${batch.id}/publish`,
    headers: auth,
    payload: { confirm_count: 0, only_failed: true },
  });
  check('republicar sem itens elegíveis é recusado', republish.statusCode === 422, republish.json());

  // Recriar o plano apagaria os itens: com anúncio já na Meta isso perderia os
  // `meta_ids` e permitiria republicar o mesmo anúncio.
  const replanejar = await app.inject({
    method: 'PUT',
    url: `/api/v1/batches/${batch.id}/plan`,
    headers: auth,
    payload: manualPlan,
  });
  const replanejarProblem = replanejar.json() as { detail?: string };
  check(
    'recriar plano de lote publicado é recusado pelo motivo certo',
    replanejar.statusCode === 422 && /já publicado/.test(replanejarProblem.detail ?? ''),
    replanejarProblem,
  );
  const aposReplan = (await app
    .inject({ method: 'GET', url: `/api/v1/batches/${batch.id}`, headers: auth })
    .then((r) => r.json())) as { items: Array<{ meta_ids: Record<string, string> }> };
  check(
    'IDs da Meta preservados após a recusa',
    aposReplan.items.length === 2 && aposReplan.items.every((item) => item.meta_ids.ad_id === graph.ids.ad),
    aposReplan.items.map((item) => item.meta_ids),
  );

  phase('FR-018 — poller de revisão');
  const poll = await runStatusPoll(workerCtx, metaFactory);
  check('poller atualizou os 2 anúncios', poll.updated === 2, poll);
  const polled = await getDraft(db, first);
  check('status de revisão refletido', polled?.status === 'in_review', polled?.status);
  check('effective_status salvo', polled?.effectiveStatus === 'PENDING_REVIEW', polled?.effectiveStatus);

  phase('US6 — auditoria e teto diário');
  const audit = await listAudit(db, { entityType: 'batch', entityId: batch.id, limit: 50 });
  const actions = audit.map((row) => row.action);
  check('auditoria registra plano, validação e publicação', ['batch.plan', 'batch.validate', 'batch.publish'].every((action) => actions.includes(action)), actions);

  const capBatch = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/batches',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: AD_ACCOUNT_ID,
        name: 'Lote além do teto',
        mode: 'manual',
      },
    })
    .then((r) => r.json())) as { id: string };
  const capItems = await app.inject({
    method: 'POST',
    url: `/api/v1/batches/${capBatch.id}/items`,
    headers: auth,
    payload: [
      {
        format: 'single_image',
        asset_ids: [ingested.asset.id],
        copy: {
          primary_text: 'Coleção de inverno com 20% OFF até sexta.',
          headline: 'Inverno com 20% OFF',
          description: 'Frete grátis acima de R$ 199',
          cta: 'SHOP_NOW',
          link: LANDING,
        },
        campaign_ref: { kind: 'existing', id: graph.ids.campaign },
        adset_ref: { kind: 'existing', id: graph.ids.adset },
        page_id: PAGE_ID,
        ig_user_id: IG_ID,
      },
      {
        format: 'single_image',
        asset_ids: [ingested.asset.id],
        copy: {
          primary_text: 'Últimos dias da coleção de inverno com 20% OFF.',
          headline: 'Últimos dias',
          description: 'Estoque limitado',
          cta: 'SHOP_NOW',
          link: LANDING,
        },
        campaign_ref: { kind: 'existing', id: graph.ids.campaign },
        adset_ref: { kind: 'existing', id: graph.ids.adset },
        page_id: PAGE_ID,
        ig_user_id: IG_ID,
      },
    ],
  });
  check('itens manuais criados', capItems.statusCode === 201, capItems.json());
  await app.inject({ method: 'POST', url: `/api/v1/batches/${capBatch.id}/validate`, headers: auth });
  const capPublish = (await app
    .inject({
      method: 'POST',
      url: `/api/v1/batches/${capBatch.id}/publish`,
      headers: auth,
      payload: { confirm_count: 2, only_failed: false },
    })
    .then((r) => r.json())) as { queued: number; skipped: number };
  check('teto diário de 3 corta o excedente', capPublish.queued === 1 && capPublish.skipped === 1, capPublish);

  phase('US7 — duplicar lote para outra conta');
  await upsertAccounts(db, connection.id, [
    {
      id: 'act_1030000000002',
      name: 'Loja Teste - SP',
      currency: 'BRL',
      timezoneName: 'America/Sao_Paulo',
      accountStatus: 1,
    },
  ]);
  await upsertPages(db, connection.id, [{ id: PAGE_ID, name: 'Loja Teste', instagramUserId: IG_ID, raw: {} }]);
  await upsertInstagramAccounts(db, connection.id, [{ id: IG_ID, username: 'lojateste', raw: {} }]);
  await upsertPixels(db, 'act_1030000000002', [{ id: '99887766554434', name: 'Pixel SP', raw: {} }]);
  await setAccountPages(db, 'act_1030000000002', [PAGE_ID]);
  await updateAccountDefaults(db, 'act_1030000000002', {
    client_id: client.id,
    default_page_id: PAGE_ID,
    default_ig_user_id: IG_ID,
    default_pixel_id: '99887766554434',
  });

  const duplicated = (await app
    .inject({
      method: 'POST',
      url: `/api/v1/batches/${batch.id}/duplicate`,
      headers: auth,
      payload: { ad_account_id: 'act_1030000000002' },
    })
    .then((r) => r.json())) as { id: string; ad_account_id: string; items: Array<{ status: string }> };
  check('lote duplicado para a outra conta', duplicated.ad_account_id === 'act_1030000000002', duplicated.ad_account_id);
  check('itens duplicados voltam para validação', duplicated.items.length === 2, duplicated.items.length);

  phase('US8 — painel de saúde');
  const totalCalls = () => [...graph.calls.values()].reduce((a, b) => a + b, 0);
  const writesAntesDiag = totalCalls();
  const health = (await app
    .inject({ method: 'GET', url: `/api/v1/ad-accounts/${AD_ACCOUNT_ID}/health`, headers: auth })
    .then((r) => r.json())) as {
    published_today: number;
    daily_cap: number;
    error_rate_1h: number;
    connection: {
      status: string;
      api_tier_observed: string;
      api_tier_configured: string;
      last_checked_at: string | null;
      last_error: string | null;
      scopes: string[];
    };
  };
  check('saúde reporta publicações do dia', health.published_today === 3, health);
  check('teto diário exposto', health.daily_cap === 3, health);
  // T-001-2: diagnóstico expõe conexão/tier/verificação sem publicar nada.
  check('diagnóstico mostra tier configurado vs observado', health.connection.api_tier_configured === 'limited', health.connection);
  check(
    'diagnóstico lista escopos da conexão',
    health.connection.scopes.includes('ads_management') && health.connection.last_checked_at !== null,
    health.connection,
  );
  check(
    'diagnóstico não chama a Meta',
    totalCalls() === writesAntesDiag,
    totalCalls() - writesAntesDiag,
  );

  phase('SC-004/T070/T071 — falhas injetadas, retomada e zero duplicata');
  const stressAccount = 'act_1030000000002';
  const stressBatch = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/batches',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: stressAccount,
        name: 'Lote de estresse',
        mode: 'manual',
      },
    })
    .then((r) => r.json())) as { id: string };
  // 5 itens (1 criativo × 5 copies) compartilhando UMA campanha e UM conjunto novos.
  const stressItems = expect<{ items: Array<{ id: string }> }>(
    'lote de estresse com 5 itens',
    await app.inject({
      method: 'PUT',
      url: `/api/v1/batches/${stressBatch.id}/plan`,
      headers: auth,
      payload: {
        ...manualPlan,
        campaigns: [{ ...manualPlan.campaigns[0], key: 'stress-c1' }],
        adsets: [{ ...manualPlan.adsets[0], key: 'stress-a1', campaign_key: 'stress-c1' }],
        items: [
          {
            ...manualPlan.items[0],
            campaign_ref: { kind: 'new', key: 'stress-c1' },
            adset_ref: { kind: 'new', key: 'stress-a1' },
            copies: ['v1', 'v2', 'v3', 'v4', 'v5'].map((v) => manualCopy(v)),
          },
        ],
      },
    }),
    200,
  ).items;
  check('plano de estresse gerou 5 itens', stressItems.length === 5, stressItems.length);
  await app.inject({ method: 'POST', url: `/api/v1/batches/${stressBatch.id}/validate`, headers: auth });

  // Falha transitória em toda etapa de escrita: cada item precisa reentrar na
  // etapa salva em `publish_jobs.step` sem repetir o que já criou.
  graph.failNext(`POST ${stressAccount}/campaigns`, 2);
  graph.failNext(`POST ${stressAccount}/adsets`, 2);
  graph.failNext(`POST ${stressAccount}/adimages`, 2);
  graph.failNext(`POST ${stressAccount}/adcreatives`, 3);
  graph.failNext(`POST ${stressAccount}/ads`, 3);

  const enfileirados = (await app
    .inject({
      method: 'POST',
      url: `/api/v1/batches/${stressBatch.id}/publish`,
      headers: auth,
      payload: { confirm_count: 5, only_failed: false },
    })
    .then((r) => r.json())) as { queued: number };
  check('5 itens enfileirados', enfileirados.queued === 5, enfileirados);

  // O stub de fila roda `runPublish` uma vez por item; aqui emulamos o BullMQ
  // reagendando até 100 execuções, como o `RETRY` faria.
  let execucoes = 0;
  let erros = 0;
  for (let volta = 0; volta < 20 && execucoes < 100; volta += 1) {
    const pendentes = (await listDraftsOfBatch(db, stressBatch.id)).filter(
      (item) => item.status !== 'published',
    );
    if (pendentes.length === 0) break;
    for (const item of pendentes) {
      if (execucoes >= 100) break;
      execucoes += 1;
      try {
        await runPublish(
          workerCtx,
          metaFactory,
          alert,
          { draftId: item.id, adAccountId: stressAccount, batchId: stressBatch.id },
          volta + 2,
        );
      } catch {
        erros += 1;
      }
    }
  }
  const stressFinal = await listDraftsOfBatch(db, stressBatch.id);
  check('falhas injetadas realmente aconteceram', erros >= 5, { execucoes, erros });
  check(
    'os 5 itens terminam publicados',
    stressFinal.length === 5 && stressFinal.every((item) => item.status === 'published'),
    stressFinal.map((item) => item.status),
  );
  check(
    'campanha e conjunto novos criados uma única vez para os 5 itens (T071)',
    graph.count(`POST ${stressAccount}/campaigns`) === 3 &&
      graph.count(`POST ${stressAccount}/adsets`) === 3,
    {
      campanhas: graph.count(`POST ${stressAccount}/campaigns`),
      conjuntos: graph.count(`POST ${stressAccount}/adsets`),
    },
  );
  check(
    'nenhum anúncio duplicado apesar das falhas (SC-004)',
    graph.count(`POST ${stressAccount}/ads`) === 8 &&
      graph.count(`POST ${stressAccount}/adcreatives`) === 8,
    {
      anuncios: graph.count(`POST ${stressAccount}/ads`),
      criativos: graph.count(`POST ${stressAccount}/adcreatives`),
      execucoes,
      erros,
    },
  );

  phase('SC-004 — entrega duplicada do mesmo job cria um anúncio só');
  // O BullMQ reentrega job considerado travado (`stalledInterval`) e um worker
  // reiniciado deixa o anterior terminando: duas execuções do MESMO item podem
  // correr juntas. O primeiro item cria campanha e conjunto, então as refs
  // ficam `ready` e o claim de ref não serializa mais nada — o lease do item é
  // a única defesa contra dois anúncios na Meta.
  const dupBatch = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/batches',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: stressAccount,
        name: 'Lote entrega duplicada',
        mode: 'manual',
      },
    })
    .then((r) => r.json())) as { id: string };
  expect<{ items: Array<{ id: string }> }>(
    'lote de entrega duplicada com 2 itens',
    await app.inject({
      method: 'PUT',
      url: `/api/v1/batches/${dupBatch.id}/plan`,
      headers: auth,
      payload: {
        ...manualPlan,
        campaigns: [{ ...manualPlan.campaigns[0], key: 'dup-c1' }],
        adsets: [{ ...manualPlan.adsets[0], key: 'dup-a1', campaign_key: 'dup-c1' }],
        items: [
          {
            ...manualPlan.items[0],
            campaign_ref: { kind: 'new', key: 'dup-c1' },
            adset_ref: { kind: 'new', key: 'dup-a1' },
            copies: [manualCopy('d1'), manualCopy('d2')],
          },
        ],
      },
    }),
    200,
  );
  await app.inject({ method: 'POST', url: `/api/v1/batches/${dupBatch.id}/validate`, headers: auth });
  // `POST /publish` marcaria `queued` e o stub de fila publicaria os dois itens
  // inline; aqui precisamos controlar a concorrência, então fazemos o mesmo que
  // a rota faz (`markDraftsQueued`) e chamamos o worker na mão.
  const dupItems = await listDraftsOfBatch(db, dupBatch.id);
  await markDraftsQueued(db, dupItems.map((item) => item.id));
  await runPublish(
    workerCtx,
    metaFactory,
    alert,
    { draftId: dupItems[0]!.id, adAccountId: stressAccount, batchId: dupBatch.id },
    1,
  );
  const adsAntes = graph.count(`POST ${stressAccount}/ads`);
  const entregas = await Promise.allSettled(
    [1, 2, 3, 4].map(() =>
      runPublish(
        workerCtx,
        metaFactory,
        alert,
        { draftId: dupItems[1]!.id, adAccountId: stressAccount, batchId: dupBatch.id },
        1,
      ),
    ),
  );
  const dupFinal = await getDraft(db, dupItems[1]!.id);
  check(
    '4 entregas simultâneas do mesmo item criam 1 anúncio',
    graph.count(`POST ${stressAccount}/ads`) - adsAntes === 1,
    { antes: adsAntes, depois: graph.count(`POST ${stressAccount}/ads`) },
  );
  // Não fixamos "3 rejeitadas": se o vencedor liberar o lease antes de um
  // perdedor chegar ao claim, esse perdedor claima e sai pelo curto-circuito de
  // `published`. O invariante é o de cima (um anúncio só); aqui só exigimos que
  // toda recusa seja contenção, nunca falha de verdade.
  check(
    'as entregas perdedoras são recusadas como contenção',
    entregas.some((e) => e.status === 'rejected') &&
      entregas.every(
        (e) => e.status === 'fulfilled' || (e.reason as Error).name === 'DraftBusyError',
      ),
    entregas.map((e) => (e.status === 'fulfilled' ? 'ok' : (e.reason as Error).name)),
  );
  check(
    'item termina published com um único ad_id',
    dupFinal?.status === 'published' && !!dupFinal.metaIds?.ad_id,
    { status: dupFinal?.status, metaIds: dupFinal?.metaIds },
  );
  check(
    'lease liberado no fim da execução',
    !dupFinal?.leaseOwner && !dupFinal?.leaseUntil,
    { leaseOwner: dupFinal?.leaseOwner, leaseUntil: dupFinal?.leaseUntil },
  );
  phase('R3 — dono do lease morre: retomada automática sem gastar tentativas');
  // Único ponto do smoke com BullMQ real: o comportamento em prova é do
  // *processador da fila*, não do pipeline. Sem `moveToDelayed` a contenção
  // consome tentativa e o item morre em `failed` antes do lease expirar.
  const LEASE_CURTO_MS = 4_000;
  const crashBatch = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/batches',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: stressAccount,
        name: 'Lote retomada pós-crash',
        mode: 'manual',
      },
    })
    .then((r) => r.json())) as { id: string };
  expect(
    'lote de retomada com 1 item',
    await app.inject({
      method: 'PUT',
      url: `/api/v1/batches/${crashBatch.id}/plan`,
      headers: auth,
      payload: {
        ...manualPlan,
        campaigns: [{ ...manualPlan.campaigns[0], key: 'crash-c1' }],
        adsets: [{ ...manualPlan.adsets[0], key: 'crash-a1', campaign_key: 'crash-c1' }],
        items: [
          {
            ...manualPlan.items[0],
            campaign_ref: { kind: 'new', key: 'crash-c1' },
            adset_ref: { kind: 'new', key: 'crash-a1' },
            copies: [manualCopy('c1')],
          },
        ],
      },
    }),
    200,
  );
  await app.inject({
    method: 'POST',
    url: `/api/v1/batches/${crashBatch.id}/validate`,
    headers: auth,
  });
  const crashItem = (await listDraftsOfBatch(db, crashBatch.id))[0]!;
  await markDraftsQueued(db, [crashItem.id]);

  const fila = new Queue<PublishJobData>(QUEUES.publish, { connection: redis });
  await fila.obliterate({ force: true });
  let tentativaMax = 0;
  const crashWorker = new Worker<PublishJobData>(
    QUEUES.publish,
    async (job, token) => {
      tentativaMax = Math.max(tentativaMax, job.attemptsMade + 1);
      return createPublishProcessor(workerCtx, metaFactory, alert)(job, token);
    },
    { connection: redis, concurrency: 1 },
  );

  // Worker que morreu sem liberar: lease cravado num dono que nunca volta. Fica
  // depois do setup da fila — o `obliterate` varre o Redis e comeria o lease se
  // ele já estivesse contando.
  const cravado = await claimDraft(db, crashItem.id, 'worker-que-morreu:1', LEASE_CURTO_MS);
  check('lease do dono morto ficou cravado', cravado.ok, cravado);
  const expiraEm = (await getDraft(db, crashItem.id))?.leaseUntil ?? null;

  const adsAntesCrash = graph.count(`POST ${stressAccount}/ads`);
  await fila.add(
    'publish',
    { draftId: crashItem.id, adAccountId: stressAccount, batchId: crashBatch.id },
    { attempts: RETRY.maxAttempts, backoff: { type: 'fixed', delay: 500 } },
  );
  let publicadoEm = 0;
  for (let i = 0; i < 60; i += 1) {
    const atual = await getDraft(db, crashItem.id);
    if (atual?.status === 'published') {
      publicadoEm = Date.now();
      break;
    }
    if (atual?.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const crashFinal = await getDraft(db, crashItem.id);
  await crashWorker.close();
  await fila.obliterate({ force: true });
  await fila.close();

  check('item publica sozinho após o lease expirar', publicadoEm > 0, {
    status: crashFinal?.status,
  });
  // Ancorado na expiração gravada, não num limiar de relógio: o que importa é
  // que a publicação só aconteceu depois de o lease do morto valer nada.
  check(
    'esperou a expiração, não passou por cima do lease',
    !!expiraEm && publicadoEm >= expiraEm.getTime(),
    { expiraEm: expiraEm?.toISOString(), publicadoEm: new Date(publicadoEm).toISOString() },
  );
  check('contenção não consumiu tentativas', tentativaMax === 1, {
    tentativaMax,
    maxAttempts: RETRY.maxAttempts,
  });
  check(
    'a retomada criou um anúncio, não dois',
    graph.count(`POST ${stressAccount}/ads`) - adsAntesCrash === 1,
    { antes: adsAntesCrash, depois: graph.count(`POST ${stressAccount}/ads`) },
  );


  phase('T-000-2 — timeout após create não duplica: reconciliação + retomada auditada');
  const recBatch = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/batches',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: stressAccount,
        name: 'Lote reconciliação',
        mode: 'manual',
      },
    })
    .then((r) => r.json())) as { id: string };
  expect(
    'lote de reconciliação com 2 itens',
    await app.inject({
      method: 'PUT',
      url: `/api/v1/batches/${recBatch.id}/plan`,
      headers: auth,
      payload: {
        ...manualPlan,
        campaigns: [],
        adsets: [],
        items: [0, 1].map((i) => ({
          format: 'single_image',
          asset_ids: [ingested.asset.id],
          campaign_ref: { kind: 'existing', id: graph.ids.campaign },
          adset_ref: { kind: 'existing', id: graph.ids.adset },
          copies: [manualCopy(`r${i}`)],
          page_id: PAGE_ID,
        })),
      },
    }),
    200,
  );
  await app.inject({
    method: 'POST',
    url: `/api/v1/batches/${recBatch.id}/validate`,
    headers: auth,
  });
  const recItems = await listDraftsOfBatch(db, recBatch.id);
  await markDraftsQueued(db, recItems.map((item) => item.id));

  // Graph que perde a resposta do primeiro create de anúncio.
  let timeoutInjected = false;
  const flakyFactory: MetaFactory = {
    ...metaFactory,
    forAccount: async (accountId, draftId) => {
      const client = await metaFactory.forAccount(accountId, draftId);
      const originalPost = client.post.bind(client);
      client.post = (async <T>(path: string, body: Record<string, unknown> = {}): Promise<T> => {
        if (!timeoutInjected && /\/ads$/.test(path)) {
          timeoutInjected = true;
          throw new MetaTimeoutError(path, 1);
        }
        return originalPost(path, body);
      }) as typeof client.post;
      return client;
    },
  };

  const adsAntesRec = graph.count(`POST ${stressAccount}/ads`);
  let reconciliacao = '';
  try {
    await runPublish(
      workerCtx,
      flakyFactory,
      alert,
      { draftId: recItems[0]!.id, adAccountId: stressAccount, batchId: recBatch.id },
      1,
    );
  } catch (error) {
    reconciliacao = (error as Error).name;
  }
  const recTravado = await getDraft(db, recItems[0]!.id);
  check('timeout no create_ad para em reconciliação', reconciliacao === 'ReconciliationRequiredError', reconciliacao);
  check('item marca needs_reconciliation, não failed', recTravado?.status === 'needs_reconciliation', recTravado?.status);
  check(
    'nenhum anúncio criado no timeout',
    graph.count(`POST ${stressAccount}/ads`) - adsAntesRec === 0,
    graph.count(`POST ${stressAccount}/ads`) - adsAntesRec,
  );
  check('sem retry cego: tentativa continua 1', recTravado?.attempts === 1, recTravado?.attempts);

  // Operador confere na Meta e adota os IDs: retoma do create_ad sem duplicar.
  const adotados = {
    ...(recTravado?.metaIds ?? {}),
    image_hashes: recTravado?.metaIds?.image_hashes ?? {},
    video_ids: recTravado?.metaIds?.video_ids ?? {},
    thumbnail_hashes: recTravado?.metaIds?.thumbnail_hashes ?? {},
  };
  expect(
    'adotar reconciliação (202)',
    await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${recBatch.id}/items/${recItems[0]!.id}/resolve`,
      headers: auth,
      payload: { decision: 'adopt', meta_ids: adotados, step: 'create_ad', motive: 'criativo existe, anúncio não' },
    }),
    202,
  );
  await runPublish(
    workerCtx,
    metaFactory,
    alert,
    { draftId: recItems[0]!.id, adAccountId: stressAccount, batchId: recBatch.id },
    1,
  );
  const recRetomado = await getDraft(db, recItems[0]!.id);
  check(
    'retomada cria um anúncio só',
    recRetomado?.status === 'published' &&
      graph.count(`POST ${stressAccount}/ads`) - adsAntesRec === 1,
    { status: recRetomado?.status, criados: graph.count(`POST ${stressAccount}/ads`) - adsAntesRec },
  );

  // Segundo item: descarte com motivo encerra sem tocar na Meta.
  await transitionDraft(db, recItems[1]!.id, 'creating_ad', { step: 'create_ad', attempts: 1 });
  await transitionDraft(db, recItems[1]!.id, 'needs_reconciliation', {
    step: 'create_ad',
    attempts: 1,
  });
  expect(
    'descartar reconciliação (202)',
    await app.inject({
      method: 'POST',
      url: `/api/v1/batches/${recBatch.id}/items/${recItems[1]!.id}/resolve`,
      headers: auth,
      payload: { decision: 'discard', motive: 'duplicado conferido na Meta' },
    }),
    202,
  );
  const recDescartado = await getDraft(db, recItems[1]!.id);
  check('descarte encerra como failed', recDescartado?.status === 'failed', recDescartado?.status);
  const resolucoes = await listAudit(db, { entityType: 'ad_draft', entityId: recItems[0]!.id, limit: 20 });
  check(
    'resolução fica na auditoria',
    resolucoes.some((a) => a.action === 'item.resolve'),
    resolucoes.map((a) => a.action),
  );

  phase('T-001-1 — revogação pós-enqueue barra execução sem tocar na Meta');
  const authBatch = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/batches',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: stressAccount,
        name: 'Lote gate de autorização',
        mode: 'manual',
      },
    })
    .then((r) => r.json())) as { id: string };
  expect(
    'lote de autorização com 2 itens',
    await app.inject({
      method: 'PUT',
      url: `/api/v1/batches/${authBatch.id}/plan`,
      headers: auth,
      payload: {
        ...manualPlan,
        campaigns: [],
        adsets: [],
        items: [0, 1].map((i) => ({
          format: 'single_image',
          asset_ids: [ingested.asset.id],
          campaign_ref: { kind: 'existing', id: graph.ids.campaign },
          adset_ref: { kind: 'existing', id: graph.ids.adset },
          copies: [manualCopy(`g${i}`)],
          page_id: PAGE_ID,
        })),
      },
    }),
    200,
  );
  await app.inject({
    method: 'POST',
    url: `/api/v1/batches/${authBatch.id}/validate`,
    headers: auth,
  });
  const authItems = await listDraftsOfBatch(db, authBatch.id);
  await markDraftsQueued(db, authItems.map((item) => item.id));

  // Janela vencida: última checagem velha → revalida remoto e publica.
  await sql`UPDATE meta_connections SET last_checked_at = NOW() - INTERVAL '1 hour' WHERE id = ${connection.id}`;
  const adsAntesAuth = graph.count(`POST ${stressAccount}/ads`);
  await runPublish(
    workerCtx,
    metaFactory,
    alert,
    { draftId: authItems[0]!.id, adAccountId: stressAccount, batchId: authBatch.id },
    1,
  );
  const authOk = await getDraft(db, authItems[0]!.id);
  const connRecheck = await getConnectionRow(db, connection.id);
  check('revalidação remota publica normal', authOk?.status === 'published', authOk?.status);
  check(
    'última verificação foi atualizada',
    !!connRecheck?.lastCheckedAt && Date.now() - connRecheck.lastCheckedAt.getTime() < 60_000,
    connRecheck?.lastCheckedAt,
  );

  // Revogação depois do enqueue: recusa antes de qualquer create.
  await updateConnectionStatus(db, connection.id, { status: 'needs_attention', lastError: 'revogado no teste' });
  let authErro = '';
  try {
    await runPublish(
      workerCtx,
      metaFactory,
      alert,
      { draftId: authItems[1]!.id, adAccountId: stressAccount, batchId: authBatch.id },
      1,
    );
  } catch (error) {
    authErro = error instanceof AccountAuthError ? error.name : `inesperado: ${(error as Error).name}`;
  }
  const authTravado = await getDraft(db, authItems[1]!.id);
  check('revogado pós-enqueue recusa com AccountAuthError', authErro === 'AccountAuthError', authErro);
  check('item vai a failed sem publicar', authTravado?.status === 'failed', authTravado?.status);
  check(
    'zero creates após revogação',
    graph.count(`POST ${stressAccount}/ads`) - adsAntesAuth === 1,
    graph.count(`POST ${stressAccount}/ads`) - adsAntesAuth,
  );
  await updateConnectionStatus(db, connection.id, { status: 'active', lastError: null });

  phase('T-001-3 — sync com token inválido marca, pausa e não gira em loop');
  const badConn = await createConnection(db, {
    businessId: '1789000000000002',
    label: 'BM quebrada (smoke)',
    token: 'EAA-token-revogado-nao-real-0123456789',
    scopes: ['ads_management', 'business_management'],
    apiTier: 'limited',
  });
  await upsertAccounts(db, badConn.id, [
    {
      id: 'act_1030000000009',
      name: 'Conta quebrada',
      currency: 'BRL',
      timezoneName: 'America/Sao_Paulo',
      accountStatus: 1,
    },
  ]);
  const tokenRecusado = new MetaApiError({
    httpStatus: 400,
    endpoint: 'v25.0/me',
    method: 'GET',
    body: { message: 'Invalid OAuth access token.', code: 190 } as never,
  });
  // `forConnection` roda fora do try do sync (falha local, não da Meta):
  // o token recusado aparece no `getMe`, dentro do try.
  const badFactory: MetaFactory = {
    ...metaFactory,
    forConnection: async (connectionId) => {
      const client = await metaFactory.forConnection(connectionId);
      const originalGet = client.get.bind(client);
      client.get = (async <T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> => {
        if (/(^|\/)me(\?|$)/.test(path)) throw tokenRecusado;
        return originalGet(path, params);
      }) as typeof client.get;
      return client;
    },
  };
  let syncErro = '';
  try {
    await runSync(workerCtx, badFactory, alert, { connectionId: badConn.id });
  } catch (error) {
    syncErro = (error as Error).name;
  }
  const badRow = await getConnectionRow(db, badConn.id);
  const contaPausada = await getAccount(db, 'act_1030000000009');
  check('job de sync termina com o erro (não engole)', syncErro === 'MetaApiError', syncErro);
  check('token inválido marca needs_attention', badRow?.status === 'needs_attention', badRow?.status);
  check(
    'contas da conexão pausadas',
    !!contaPausada?.pausedUntil && contaPausada.pausedUntil.getTime() > Date.now(),
    contaPausada?.pausedUntil,
  );
  // Segunda rodada: pula sem chamar a Meta e sem falhar — o agendamento tenta
  // de novo sozinho quando humano reconectar.
  const chamadasAntesSkip = totalCalls();
  const pulado = await runSync(workerCtx, metaFactory, alert, { connectionId: badConn.id });
  check(
    'sync pula conexão sem autorização',
    pulado.accounts === 0 && totalCalls() === chamadasAntesSkip,
    { contas: pulado.accounts, chamadas: totalCalls() - chamadasAntesSkip },
  );
  // Rotação com token aceito reativa a conexão.
  const girada = await app.inject({
    method: 'POST',
    url: `/api/v1/connections/${badConn.id}/rotate`,
    headers: auth,
    payload: { token: 'EAA-token-novo-nao-real-0123456789012345' },
  });
  check('rotação com token aceito reativa (200)', girada.statusCode === 200, girada.json());
  const tokenRuim = await app.inject({
    method: 'POST',
    url: `/api/v1/connections/${badConn.id}/rotate`,
    headers: auth,
    payload: { token: 'curto' },
  });
  check('rotação recusa token inválido (422)', tokenRuim.statusCode === 422, tokenRuim.statusCode);

  phase('T-004 — sync de Insights vira observação canônica');
  await sql`UPDATE ad_accounts SET client_id = ${client.id} WHERE id = ${stressAccount}`;
  const mutacoesAntes =
    graph.count(`POST ${stressAccount}/ads`) +
    graph.count(`POST ${stressAccount}/campaigns`) +
    graph.count(`POST ${stressAccount}/adsets`);
  const syncJob = await app.inject({
    method: 'POST',
    url: '/api/v1/insights/sync-jobs',
    headers: auth,
    payload: { ad_account_id: stressAccount, since: '2026-09-01', until: '2026-09-02' },
  });
  check('sync de insights aceito (202)', syncJob.statusCode === 202, syncJob.statusCode);
  const obs = (await app
    .inject({
      method: 'GET',
      url: `/api/v1/observations?ad_account_id=${stressAccount}&source=api`,
      headers: auth,
    })
    .then((r) => r.json())) as Array<{
    ad_id: string | null;
    source: string;
    snapshot_id: string;
    metrics: Record<string, number | string>;
  }>;
  check('2 páginas viram 3 observações', obs.length === 3, obs.length);
  check('números saem numéricos, fonte api', obs.every((o) => o.source === 'api' && typeof o.metrics.spend === 'number'), obs.map((o) => o.metrics.spend));
  check('snapshot vinculado', obs.every((o) => typeof o.snapshot_id === 'string'), obs[0]);
  const estado = (await app
    .inject({ method: 'GET', url: `/api/v1/insights/sync-jobs?ad_account_id=${stressAccount}`, headers: auth })
    .then((r) => r.json())) as { last_daily_covered: string; consecutive_failures: number };
  check('checkpoint gravado sem falhas', estado.last_daily_covered === '2026-09-02' && estado.consecutive_failures === 0, estado);
  // Repetir a mesma janela não duplica a canônica (retomada idempotente).
  await app.inject({
    method: 'POST',
    url: '/api/v1/insights/sync-jobs',
    headers: auth,
    payload: { ad_account_id: stressAccount, since: '2026-09-01', until: '2026-09-02' },
  });
  const obs2 = (await app
    .inject({
      method: 'GET',
      url: `/api/v1/observations?ad_account_id=${stressAccount}&source=api`,
      headers: auth,
    })
    .then((r) => r.json())) as unknown[];
  check('resync não duplica observações', obs2.length === 3, obs2.length);
  // Conta quebrada falha sozinha; sync nunca muta entrega.
  let quebrou = '';
  try {
    await runInsightsSync(workerCtx, metaFactory, alert, { adAccountId: 'act_inexistente', since: '2026-09-01', until: '2026-09-02' });
  } catch (error) {
    quebrou = (error as Error).message;
  }
  check('conta inexistente falha isolada', quebrou.includes('não existe'), quebrou);
  check(
    'sync só lê, nunca cria anúncio/campanha/conjunto',
    graph.count(`POST ${stressAccount}/ads`) +
      graph.count(`POST ${stressAccount}/campaigns`) +
      graph.count(`POST ${stressAccount}/adsets`) ===
      mutacoesAntes,
    mutacoesAntes,
  );

  phase('T-005 — performance soma numeradores, sem inventar');
  const perf = (await app
    .inject({
      method: 'GET',
      url: `/api/v1/performance?ad_account_id=${stressAccount}&source=api`,
      headers: auth,
    })
    .then((r) => r.json())) as {
    totals: { spend: number; cpa: { value: number | null; reason?: string } };
    rows: Array<{ cpa: number | null }>;
    cohort: { comparable: boolean };
    verdict: { sufficiency: string };
    sources: { observations: number };
    metric_version: string;
  };
  check('gasto total soma as linhas', perf.totals.spend === 310.5, perf.totals);
  check('sem resultados = CPA indisponível com motivo', perf.totals.cpa.value === null && !!perf.totals.cpa.reason, perf.totals.cpa);
  check('coorte única comparável, sem política = não avaliado', perf.cohort.comparable && perf.verdict.sufficiency === 'unevaluated', perf.verdict);
  check('3 linhas rastreáveis', perf.rows.length === 2 && perf.sources.observations === 3, perf.sources);

  phase('T-006 — análise de conteúdo versionada, sem performance junto');
  const planInvoker = fakeAiInvoker(ingested.asset.id);
  deps.ai = new AiClient({
    invoke: (async (request: { toolName: string }) => {
      if (request.toolName === 'submit_content_analysis') {
        return {
          input: {
            observations: [
              {
                tipo: 'abertura',
                texto: 'Produto em close antes da oferta',
                evidence_refs: [{ kind: 'frame', t: 0, detail: 'close do produto' }],
              },
            ],
            limitations: ['trecho final não inspecionado'],
          },
          inputTokens: 100,
          outputTokens: 50,
        };
      }
      if (request.toolName === 'submit_analysis_report') {
        return {
          input: {
            performance_findings: [{ text: 'Gasto total no período', metric: 'spend', value: 310.5 }],
            content_observations: [],
            hypotheses: [
              {
                text: 'Observar abertura em próximo teste',
                support_refs: [],
                confounders: ['sazonalidade'],
                test: 'variar só a abertura',
              },
            ],
            recommended_tests: [
              { variable: 'abertura', keeps: ['oferta'], goal: 'baixar CPA', metric: 'cpa', preconditions: [] },
            ],
            limitations: ['janela curta de 2 dias'],
          },
          inputTokens: 200,
          outputTokens: 100,
        };
      }
      return planInvoker();
    }) as never,
    models: { generation: 'claude-sonnet-4-6', classify: 'claude-haiku-4-6' },
  });
  const analisada = (await app
    .inject({
      method: 'POST',
      url: `/api/v1/assets/${ingested.asset.id}/analyses`,
      headers: auth,
      payload: { brand_context: 'Loja Teste' },
    })
    .then((r) => ({ status: r.statusCode, body: r.json() as { id: string; coverage: { transcript: string }; cost_usd: string } })));
  check('análise criada (201)', analisada.status === 201, analisada.status);
  check('transcrição indisponível visível', analisada.body.coverage?.transcript === 'unavailable', analisada.body.coverage);
  const repetida = await app.inject({
    method: 'POST',
    url: `/api/v1/assets/${ingested.asset.id}/analyses`,
    headers: auth,
    payload: {},
  });
  check('mesma entrada reutiliza (200)', repetida.statusCode === 200, repetida.statusCode);
  const corrigida = (await app
    .inject({
      method: 'PATCH',
      url: `/api/v1/analyses/${analisada.body.id}`,
      headers: auth,
      payload: { findings: { observations: [], limitations: ['corrigido pelo gestor'] } },
    })
    .then((r) => r.json())) as { revision: number; id: string };
  check('correção vira revisão 2', corrigida.revision === 2, corrigida);
  const lista = (await app
    .inject({ method: 'GET', url: `/api/v1/assets/${ingested.asset.id}/analyses`, headers: auth })
    .then((r) => r.json())) as Array<{ revision: number }>;
  check('original preservado', lista.length === 2, lista.length);

  phase('T-007 — relatório imutável, feedback, export e rascunho');
  const relatorio = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/analysis-reports',
      headers: auth,
      payload: { ad_account_id: stressAccount, from: '2026-09-01', to: '2026-09-02' },
    })
    .then((r) => ({ status: r.statusCode, body: r.json() as { id: string; input_snapshot: { totals: { spend: number } } } })));
  check('relatório gerado e validado (201)', relatorio.status === 201, relatorio.status);
  check('snapshot congela os valores usados', relatorio.body.input_snapshot?.totals?.spend === 310.5, relatorio.body.input_snapshot?.totals);
  const detalhe = (await app
    .inject({ method: 'GET', url: `/api/v1/analysis-reports/${relatorio.body.id}`, headers: auth })
    .then((r) => r.json())) as { output: { hypotheses: unknown[] }; feedbacks: unknown[] };
  check('relatório legível com hipóteses', detalhe.output?.hypotheses?.length === 1, detalhe.output);
  const fb = await app.inject({
    method: 'POST',
    url: `/api/v1/analysis-reports/${relatorio.body.id}/feedback`,
    headers: auth,
    payload: { text: 'Abertura 2 converte melhor no orgânico.' },
  });
  check('feedback versionado (201)', fb.statusCode === 201, fb.statusCode);
  const csvExp = await app.inject({
    method: 'GET',
    url: `/api/v1/analysis-reports/${relatorio.body.id}/export?format=csv`,
    headers: auth,
  });
  check('export CSV com fatos', csvExp.statusCode === 200 && csvExp.body.includes('fato;'), csvExp.body.slice(0, 120));
  const adsAntesRascunho = graph.count(`POST ${stressAccount}/ads`);
  const rascunho = (await app
    .inject({
      method: 'POST',
      url: `/api/v1/analysis-reports/${relatorio.body.id}/test-drafts`,
      headers: auth,
      payload: { briefing: 'Variação com abertura em close, mesma oferta.' },
    })
    .then((r) => ({ status: r.statusCode, body: r.json() as { batch_id: string } })));
  check('rascunho criado sem Meta (201)', rascunho.status === 201 && !!rascunho.body.batch_id, rascunho);
  check('rascunho não cria anúncio', graph.count(`POST ${stressAccount}/ads`) === adsAntesRascunho, adsAntesRascunho);

  phase('T-008 — aprendizado vira teste e resultado negativo permanece');
  const aprendido = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/learnings',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: stressAccount,
        source_report_id: relatorio.body.id,
        hypothesis: 'Abertura em close baixa o CPA',
        primary_metric: 'cpa',
      },
    })
    .then((r) => ({ status: r.statusCode, body: r.json() as { id: string; evidence_level: string } })));
  check('aprendizado salvo como hipótese (201)', aprendido.status === 201 && aprendido.body.evidence_level === 'hypothesis', aprendido);
  const briefing = (await app
    .inject({ method: 'POST', url: `/api/v1/learnings/${aprendido.body.id}/test-briefing`, headers: auth })
    .then((r) => r.json())) as { briefing: string };
  check('briefing carrega a hipótese', briefing.briefing.includes('Abertura em close'), briefing.briefing.slice(0, 120));
  const teste = (await app
    .inject({
      method: 'POST',
      url: `/api/v1/learnings/${aprendido.body.id}/test-drafts`,
      headers: auth,
      payload: { briefing: briefing.briefing },
    })
    .then((r) => ({ status: r.statusCode, body: r.json() as { batch_id: string } })));
  check('rascunho do aprendizado (201)', teste.status === 201 && !!teste.body.batch_id, teste);
  const loteTeste = (await app
    .inject({ method: 'GET', url: `/api/v1/batches/${teste.body.batch_id}`, headers: auth })
    .then((r) => r.json())) as { status: string };
  check('rascunho nasce draft, sem Meta', loteTeste.status === 'draft', loteTeste.status);
  const pulo = await app.inject({
    method: 'PATCH',
    url: `/api/v1/learnings/${aprendido.body.id}/outcome`,
    headers: auth,
    payload: { evidence_level: 'controlled_test' },
  });
  check('pulo de nível é recusado (422)', pulo.statusCode === 422, pulo.statusCode);
  const resultado = await app.inject({
    method: 'PATCH',
    url: `/api/v1/learnings/${aprendido.body.id}/outcome`,
    headers: auth,
    payload: { result_summary: 'CPA subiu 12%', outcome: 'negative' },
  });
  check('resultado negativo registrado', resultado.statusCode === 200, resultado.statusCode);
  const historico = (await app
    .inject({ method: 'GET', url: `/api/v1/learnings?client_id=${client.id}`, headers: auth })
    .then((r) => r.json())) as Array<{ outcome: string | null }>;
  check('negativo permanece no histórico', historico.some((l) => l.outcome === 'negative'), historico.length);

  phase('T-009 — dedup, flags e métricas operacionais');
  const { dedupAlert } = await import('@adpub/db');
  const primeiro = await dedupAlert(db, alert, {
    rule: 'reconciliation',
    adAccountId: stressAccount,
    entity: 'smoke-dedup',
    title: 'Reconciliação necessária (smoke)',
    detail: 'incidente sintético',
    severity: 'warning',
  });
  const segundo = await dedupAlert(db, alert, {
    rule: 'reconciliation',
    adAccountId: stressAccount,
    entity: 'smoke-dedup',
    title: 'Reconciliação necessária (smoke)',
    detail: 'incidente sintético',
    severity: 'warning',
  });
  check('mesmo incidente abre 1 alerta', primeiro.alerted && !segundo.alerted, [primeiro.alerted, segundo.alerted]);
  const metrics = (await app
    .inject({ method: 'GET', url: '/api/v1/ops/metrics', headers: auth })
    .then((r) => r.json())) as {
    queues: Record<string, unknown>;
    ai_cost_usd: { totalUsd: number };
    terminal_failure_rate: number | null;
    items_by_status: Record<string, number>;
  };
  check('métricas expõem filas e custo', !!metrics.queues && typeof metrics.ai_cost_usd.totalUsd === 'number', Object.keys(metrics));
  check('taxa de falha terminal calculada', metrics.terminal_failure_rate !== null, metrics.terminal_failure_rate);

  // Flags off: inteligência dá 503, publish segue sem consultar flag.
  const offApp = await buildApp(
    { ...deps, env: { ...deps.env, featureAiAnalysis: false, featureReports: false, featureInsights: false } },
    {},
  );
  try {
    const r1 = await offApp.inject({ method: 'POST', url: '/api/v1/report-imports', headers: auth });
    const r2 = await offApp.inject({
      method: 'POST',
      url: '/api/v1/insights/sync-jobs',
      headers: auth,
      payload: { ad_account_id: stressAccount, since: '2026-09-01', until: '2026-09-02' },
    });
    const r3 = await offApp.inject({
      method: 'POST',
      url: `/api/v1/batches/${batch.id}/publish`,
      headers: auth,
      payload: { confirm_count: 0, only_failed: false },
    });
    check('inteligência desligada dá 503', r1.statusCode === 503 && r2.statusCode === 503, [r1.statusCode, r2.statusCode]);
    check('publish sem flag responde normal (422, nada pronto)', r3.statusCode === 422, r3.statusCode);
  } finally {
    await offApp.close();
  }

  phase('FR-006 — troca de plano é atômica');
  const atomBatch = (await app
    .inject({
      method: 'POST',
      url: '/api/v1/batches',
      headers: auth,
      payload: {
        client_id: client.id,
        ad_account_id: AD_ACCOUNT_ID,
        name: 'Lote da troca atômica',
        mode: 'manual',
      },
    })
    .then((r) => r.json())) as { id: string };
  await app.inject({
    method: 'PUT',
    url: `/api/v1/batches/${atomBatch.id}/plan`,
    headers: auth,
    payload: manualPlan,
  });
  const linha = (position: number, tag: string): DraftInsert => ({
    batchId: atomBatch.id,
    position,
    campaignRef: { kind: 'existing', id: graph.ids.campaign },
    adsetRef: { kind: 'existing', id: graph.ids.adset },
    format: 'single_image',
    assetIds: [ingested.asset.id],
    copy: copySchema.parse(manualCopy(tag)),
    name: `troca-${tag}-${position}`,
    pageId: PAGE_ID,
    igUserId: IG_ID,
    idempotencyKey: `troca-${tag}-${position}-${Date.now()}`,
  });
  const planoDe = (notes: string): BatchPlan => batchPlanSchema.parse({ ...manualPlan, notes });

  // Falha depois do delete (duas linhas na mesma `position` violam o unique):
  // sem transação isso apagaria o lote inteiro.
  const antes = await listDraftsOfBatch(db, atomBatch.id);
  let estourou = false;
  try {
    await swapBatchPlan(db, {
      batchId: atomBatch.id,
      plan: planoDe('nunca-grava'),
      drafts: [linha(0, 'x'), linha(0, 'y')],
      blockingStatuses: BLOCKING_STATUSES,
    });
  } catch {
    estourou = true;
  }
  check('inserção inválida estoura a troca', estourou);
  const sobreviveram = await listDraftsOfBatch(db, atomBatch.id);
  check('itens antigos sobrevivem ao rollback', sobreviveram.length === antes.length, {
    antes: antes.length,
    depois: sobreviveram.length,
  });
  const loteApos = await getBatch(db, atomBatch.id);
  check('plano antigo preservado no rollback', loteApos?.plan?.notes !== 'nunca-grava', loteApos?.plan?.notes);

  // Trocas concorrentes. Rodadas pares começam **sem itens**: não existe linha
  // de `ad_drafts` para travar, então só o `for update` no lote serializa as
  // duas. Rodadas ímpares começam com itens (aí o lock dos itens também vale).
  // Sem serialização, uma apaga o que a outra inseriu e o plano gravado deixa
  // de bater com os itens (ou o insert colide no unique de `position`).
  const problemas: string[] = [];
  for (let rodada = 0; rodada < 10; rodada += 1) {
    if (rodada % 2 === 0) await deleteDraftsOfBatch(db, atomBatch.id);
    const disputa = await Promise.allSettled([
      swapBatchPlan(db, {
        batchId: atomBatch.id,
        plan: planoDe(`plano-a${rodada}`),
        drafts: [0, 1, 2].map((i) => linha(i, `a${rodada}`)),
        blockingStatuses: BLOCKING_STATUSES,
      }),
      swapBatchPlan(db, {
        batchId: atomBatch.id,
        plan: planoDe(`plano-b${rodada}`),
        drafts: [0, 1, 2, 3, 4].map((i) => linha(i, `b${rodada}`)),
        blockingStatuses: BLOCKING_STATUSES,
      }),
    ]);
    const recusada = disputa.find((r) => r.status === 'rejected');
    if (recusada?.status === 'rejected') {
      problemas.push(`rodada ${rodada}: ${String(recusada.reason).slice(0, 90)}`);
      continue;
    }
    const itens = await listDraftsOfBatch(db, atomBatch.id);
    const lote = await getBatch(db, atomBatch.id);
    const notas = lote?.plan?.notes ?? '';
    const vencedor = notas === `plano-a${rodada}` ? `a${rodada}` : `b${rodada}`;
    const esperado = vencedor.startsWith('a') ? 3 : 5;
    const misturado = itens.some((item) => !item.name.startsWith(`troca-${vencedor}-`));
    if (itens.length !== esperado || misturado) {
      problemas.push(`rodada ${rodada}: plano ${notas} com ${itens.map((i) => i.name).join(',')}`);
    }
  }
  check('10 pares de trocas concorrentes (5 com lote vazio) sem perda nem mistura', problemas.length === 0, problemas.slice(0, 3));

  await app.close();
  redis.disconnect();
  await sql.end({ timeout: 5 });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (failures > 0) {
    console.error(`\nSMOKE FALHOU: ${failures} verificação(ões) em ${seconds}s`);
    process.exit(1);
  }
  console.log(`\nSMOKE OK em ${seconds}s — nenhuma chamada real à Meta.`);
}

await main();
