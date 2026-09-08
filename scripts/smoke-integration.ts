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
  createConnection,
  createDb,
  deleteDraftsOfBatch,
  getBatch,
  claimDraft,
  getDraft,
  markDraftsQueued,
  listAudit,
  listDraftsOfBatch,
  setAccountPages,
  swapBatchPlan,
  updateAccountDefaults,
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
import { MetaClient } from '@adpub/meta-client';
import { Storage } from '@adpub/storage';
import { buildApp } from '@adpub/api/app';
import type { ApiDeps, JobRef, Queues } from '@adpub/api/lib/deps';
import { runPublish } from '@adpub/worker/publish/pipeline';
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
  const health = (await app
    .inject({ method: 'GET', url: `/api/v1/ad-accounts/${AD_ACCOUNT_ID}/health`, headers: auth })
    .then((r) => r.json())) as { published_today: number; daily_cap: number; error_rate_1h: number };
  check('saúde reporta publicações do dia', health.published_today === 3, health);
  check('teto diário exposto', health.daily_cap === 3, health);

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

  // Worker que morreu sem liberar: lease cravado num dono que nunca volta.
  const cravado = await claimDraft(db, crashItem.id, 'worker-que-morreu:1', LEASE_CURTO_MS);
  check('lease do dono morto ficou cravado', cravado.ok, cravado);

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
  const adsAntesCrash = graph.count(`POST ${stressAccount}/ads`);
  const inicioCrash = Date.now();
  await fila.add(
    'publish',
    { draftId: crashItem.id, adAccountId: stressAccount, batchId: crashBatch.id },
    { attempts: RETRY.maxAttempts, backoff: { type: 'fixed', delay: 500 } },
  );
  let crashPublicado = false;
  for (let i = 0; i < 40; i += 1) {
    const atual = await getDraft(db, crashItem.id);
    if (atual?.status === 'published') {
      crashPublicado = true;
      break;
    }
    if (atual?.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const crashSegundos = (Date.now() - inicioCrash) / 1000;
  const crashFinal = await getDraft(db, crashItem.id);
  await crashWorker.close();
  await fila.obliterate({ force: true });
  await fila.close();

  check('item publica sozinho após o lease expirar', crashPublicado, {
    status: crashFinal?.status,
    segundos: crashSegundos,
  });
  check('esperou a expiração, não passou por cima do lease', crashSegundos >= 3, crashSegundos);
  check('contenção não consumiu tentativas', tentativaMax === 1, {
    tentativaMax,
    maxAttempts: RETRY.maxAttempts,
  });
  check(
    'a retomada criou um anúncio, não dois',
    graph.count(`POST ${stressAccount}/ads`) - adsAntesCrash === 1,
    { antes: adsAntesCrash, depois: graph.count(`POST ${stressAccount}/ads`) },
  );


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
