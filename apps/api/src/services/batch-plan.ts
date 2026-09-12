import { idempotencyKey } from '@adpub/crypto';
import {
  audit,
  batchWithItems,
  getBatch,
  insertDrafts,
  listCurrentAnalysesForAssets,
  listDraftsOfBatch,
  listLearnings,
  linkBatchPlanGeneration,
  refreshBatchStatus,
  saveGeneration,
  findCachedGeneration,
  swapBatchPlan,
  type AdDraftRow,
  type AssetRow,
  type BatchRow,
  type DraftInsert,
} from '@adpub/db';
import { applyAutoFields, statusFromValidation, validateItem } from '@adpub/rules';
import {
  adDraftInputSchema,
  IN_FLIGHT_STATUSES,
  PUBLISHED_STATUSES,
  type AdDraftInput,
  type AdDraftStatus,
  type BatchPlan,
  type Copy,
  type PlanItem,
  type SessionUser,
} from '@adpub/shared';
import type { AiAssetInsight, AiCache, AiLearningRef, PlanContext } from '@adpub/ai';
import { notFound, unprocessable, type ProblemError } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { assetsForDrafts, loadBatchContext, validateContextFrom } from './batch-context.js';

export function aiCacheFor(deps: ApiDeps, batchId: string | null): AiCache {
  return {
    async find(input) {
      const row = await findCachedGeneration(
        deps.db,
        input.purpose,
        input.promptVersion,
        input.model,
        input.inputHash,
      );
      return row ? { output: row.output, model: row.model } : undefined;
    },
    async save(input) {
      await saveGeneration(deps.db, { ...input, batchId });
    },
  };
}

const BLOCKING_STATUSES: readonly AdDraftStatus[] = [
  ...IN_FLIGHT_STATUSES,
  ...PUBLISHED_STATUSES,
];

/**
 * Recriar o plano apaga os itens do lote. Item na fila ou já publicado carrega
 * `meta_ids` e `idempotency_key`: apagá-lo perderia a idempotência e permitiria
 * republicar o mesmo anúncio. Nesse caso o lote é intocável - duplique-o.
 */
function assertReplaceable(existing: readonly { status: AdDraftStatus }[]): void {
  const travados = existing.filter((item) => BLOCKING_STATUSES.includes(item.status));
  if (travados.length === 0) return;
  throw travadoError(travados.length);
}

function travadoError(quantos: number): ProblemError {
  return unprocessable(
    `Lote tem ${quantos} item(ns) em publicação ou já publicado(s): o plano não pode ser recriado. Duplique o lote para uma nova versão.`,
  );
}

/**
 * Troca os itens do lote pelos do plano novo numa transação só (checagem,
 * delete, inserção e gravação do plano): entre a checagem de cima e este ponto
 * há a chamada da IA, que leva segundos.
 */
async function swapPlan(
  deps: ApiDeps,
  input: { batchId: string; plan: BatchPlan; drafts: DraftInsert[] },
): Promise<AdDraftRow[]> {
  const swap = await swapBatchPlan(deps.db, { ...input, blockingStatuses: BLOCKING_STATUSES });
  if (swap.blocked.length > 0) throw travadoError(swap.blocked.length);
  return swap.items;
}

/** FR-006: briefing + criativos + conta → BatchPlan → itens persistidos. */

/** Linha de análise no formato que o contexto do plano consome. */
export interface AnalysisRowLike {
  assetId: string;
  revision: number;
  createdAt: Date;
  findings: { observations: Array<{ texto: string }>; limitations?: string[] };
  coverage: { transcript: string };
}

/** Linha de aprendizado no formato que o contexto do plano consome. */
export interface LearningRowLike {
  hypothesis: string;
  evidenceLevel: string;
  limitations: string[];
  outcome: string | null;
}

/** Força da evidência: o contexto prefere teste controlado a hipótese solta. */
const EVIDENCE_RANK: Record<string, number> = {
  controlled_test: 3,
  consistent_observation: 2,
  hypothesis: 1,
};

/**
 * A1: transforma análises em observações citáveis por criativo. Observação
 * sem texto não vira "sem análise": a ausência é dita no contexto, não
 * preenchida com suposição. Quando há mais de uma análise não substituída,
 * vence a de maior revisão.
 */
export function insightsByAsset(rows: readonly AnalysisRowLike[]): Map<string, AiAssetInsight> {
  const map = new Map<string, AiAssetInsight>();
  const chosen = new Map<string, AnalysisRowLike>();
  for (const row of rows) {
    const current = chosen.get(row.assetId);
    if (!current || row.revision > current.revision) chosen.set(row.assetId, row);
  }
  for (const [assetId, row] of chosen) {
    const observations = row.findings.observations
      .map((observation) => observation.texto.trim())
      .filter((text) => text.length > 0);
    if (observations.length === 0) continue;
    map.set(assetId, {
      observations,
      limitations: row.findings.limitations ?? [],
      revision: row.revision,
      analyzed_at: row.createdAt.toISOString().slice(0, 10),
      transcript: row.coverage.transcript === 'ready' ? 'ready' : 'unavailable',
    });
  }
  return map;
}

/**
 * A12: aprendizados do cliente entram por força de evidência, nunca como
 * verdade — o nível vai junto no texto e o prompt diz como tratá-lo.
 */
export function learningRefs(rows: readonly LearningRowLike[]): AiLearningRef[] {
  return [...rows]
    .sort((a, b) => (EVIDENCE_RANK[b.evidenceLevel] ?? 0) - (EVIDENCE_RANK[a.evidenceLevel] ?? 0))
    .slice(0, 10)
    .map((row) => ({
      hypothesis: row.hypothesis,
      evidence_level: row.evidenceLevel,
      limitations: row.limitations,
      outcome: row.outcome,
    }));
}

export async function generatePlan(
  deps: ApiDeps,
  actor: SessionUser,
  input: { batchId: string; assetIds: string[]; copiesPerCreative: number; regenerate: boolean },
): Promise<{ batch: BatchRow; items: AdDraftRow[] }> {
  if (!deps.ai) throw unprocessable('Copiloto de IA não configurado (ANTHROPIC_API_KEY).');
  const batch = await getBatch(deps.db, input.batchId);
  if (!batch) throw notFound(`Lote ${input.batchId} não encontrado.`);

  const existing = await listDraftsOfBatch(deps.db, batch.id);
  if (existing.length > 0 && !input.regenerate) {
    throw unprocessable('O lote já tem itens. Use regenerate=true para recriar o plano.');
  }
  assertReplaceable(existing);

  const ctx = await loadBatchContext(deps, {
    clientId: batch.clientId,
    adAccountId: batch.adAccountId,
  });
  const assets = await assetsForDrafts(deps, input.assetIds);
  if (assets.length === 0) {
    throw unprocessable('Selecione ao menos um criativo válido para gerar o plano.');
  }
  // A1/A12: o plano nasce sabendo o que já foi observado na peça e o que o
  // cliente já registrou como aprendizado — sem isso a copy combinava com o
  // briefing e não com o criativo.
  const [analyses, clientLearnings] = await Promise.all([
    listCurrentAnalysesForAssets(
      deps.db,
      assets.map((asset) => asset.id),
    ),
    listLearnings(deps.db, batch.clientId),
  ]);
  const insights = insightsByAsset(analyses);

  const planContext: PlanContext = {
    briefing: batch.briefing ?? '',
    copiesPerCreative: input.copiesPerCreative,
    account: {
      id: ctx.account.id,
      name: ctx.account.name,
      currency: ctx.account.currency,
      timezone: ctx.account.timezoneName,
      default_page_id: ctx.account.defaultPageId,
      default_ig_user_id: ctx.account.defaultIgUserId,
      default_pixel_id: ctx.account.defaultPixelId,
    },
    client: {
      name: ctx.client.name,
      voice_profile: ctx.client.voiceProfile,
      naming_template: ctx.client.namingTemplate,
      default_utm: ctx.client.defaultUtm,
      landing_domains: ctx.client.landingDomains,
    },
    assets: assets.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      kind: asset.kind,
      aspect_ratio: asset.aspectRatio,
      duration_ms: asset.durationMs,
      insight: insights.get(asset.id) ?? null,
    })),
    learnings: learningRefs(clientLearnings),
    campaigns: ctx.campaigns,
    adsets: ctx.adsets,
  };

  const { plan, meta } = await deps.ai.generatePlan(planContext, {
    scope: batch.clientId,
    batchId: batch.id,
    // Recriar o plano é pedir outra alternativa: sem isto o cache devolvia o
    // plano antigo e o botão de regenerar não fazia nada.
    bypassCache: input.regenerate,
  });
  assertPlanRefs(plan);

  // A12: o lote fica ligado à geração que consumiu — inclusive quando o plano
  // veio do cache, que é a linha em `ai_generations` que já existia. Regenerar
  // também marca o plano descartado.
  const generation = await findCachedGeneration(
    deps.db,
    'plan',
    meta.promptVersion,
    meta.model,
    meta.inputHash,
  );
  await linkBatchPlanGeneration(deps.db, batch.id, {
    generationId: generation?.id ?? null,
    regenerated: Boolean(input.regenerate),
  });

  const drafts = await buildPlanDrafts(deps, { batch, plan, assets });
  const items = await swapPlan(deps, { batchId: batch.id, plan, drafts });

  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'batch.plan',
    entityType: 'batch',
    entityId: batch.id,
    after: {
      items: items.length,
      pending: plan.pending,
      model: meta.model,
      prompt_version: meta.promptVersion,
      cached: meta.cached,
      cost_usd: meta.costUsd,
    },
  });

  const result = await batchWithItems(deps.db, batch.id);
  if (!result) throw notFound(`Lote ${batch.id} desapareceu.`);
  return result;
}

/**
 * Toda ref `new` precisa de spec no plano — sem isso o item só falharia na
 * etapa `ensure_campaign`, depois de já ter passado pela validação e pela fila.
 */
export function assertPlanRefs(plan: BatchPlan): void {
  const campaignKeys = new Set(plan.campaigns.map((campaign) => campaign.key));
  const adsetKeys = new Set(plan.adsets.map((adset) => adset.key));
  const faltando: string[] = [];

  plan.items.forEach((item, index) => {
    if (item.campaign_ref.kind === 'new' && !campaignKeys.has(item.campaign_ref.key)) {
      faltando.push(`item ${index + 1}: campanha "${item.campaign_ref.key}"`);
    }
    if (item.adset_ref.kind === 'new' && !adsetKeys.has(item.adset_ref.key)) {
      faltando.push(`item ${index + 1}: conjunto "${item.adset_ref.key}"`);
    }
  });

  for (const adset of plan.adsets) {
    if (adset.campaign_key && !campaignKeys.has(adset.campaign_key)) {
      faltando.push(`conjunto "${adset.key}": campanha "${adset.campaign_key}"`);
    }
  }

  if (faltando.length > 0) {
    throw unprocessable(
      `Plano com referências sem especificação — ${faltando.join('; ')}. ` +
        'Descreva a campanha/conjunto novo no plano ou aponte para um existente.',
    );
  }
}

/** FR-008: o construtor manual entrega o mesmo `BatchPlan` do modo IA. */
export async function setManualPlan(
  deps: ApiDeps,
  actor: SessionUser,
  input: { batchId: string; plan: BatchPlan },
): Promise<{ batch: BatchRow; items: AdDraftRow[] }> {
  const batch = await getBatch(deps.db, input.batchId);
  if (!batch) throw notFound(`Lote ${input.batchId} não encontrado.`);
  assertPlanRefs(input.plan);

  const requested = [...new Set(input.plan.items.flatMap((item) => item.asset_ids))];
  const assets = await assetsForDrafts(deps, requested);
  const known = new Set(assets.map((asset) => asset.id));
  const missing = requested.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw unprocessable(`Criativos não encontrados neste cliente: ${missing.join(', ')}.`);
  }

  const drafts = await buildPlanDrafts(deps, { batch, plan: input.plan, assets });
  const items = await swapPlan(deps, { batchId: batch.id, plan: input.plan, drafts });

  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'batch.plan.manual',
    entityType: 'batch',
    entityId: batch.id,
    after: {
      items: items.length,
      campaigns: input.plan.campaigns.length,
      adsets: input.plan.adsets.length,
    },
  });

  const result = await batchWithItems(deps.db, batch.id);
  if (!result) throw notFound(`Lote ${batch.id} desapareceu.`);
  return result;
}

/** Expande o plano em linhas: 1 AdDraft por (criativo × variação de copy). */
async function buildPlanDrafts(
  deps: ApiDeps,
  input: { batch: BatchRow; plan: BatchPlan; assets: AssetRow[] },
): Promise<DraftInsert[]> {
  const ctx = await loadBatchContext(deps, {
    clientId: input.batch.clientId,
    adAccountId: input.batch.adAccountId,
  });
  const objectiveByCampaignKey = new Map(input.plan.campaigns.map((c) => [c.key, c.objective]));
  const now = deps.now?.() ?? new Date();

  const drafts: DraftInsert[] = [];
  let position = 0;

  input.plan.items.forEach((item: PlanItem) => {
    item.copies.forEach((copy: Copy, variantIndex) => {
      const objective =
        item.campaign_ref.kind === 'new'
          ? objectiveByCampaignKey.get(item.campaign_ref.key)
          : ctx.campaigns.find((c) => c.id === (item.campaign_ref as { id: string }).id)?.objective;

      const base: AdDraftInput = adDraftInputSchema.parse({
        format: item.format,
        asset_ids: item.asset_ids,
        copy,
        name: '',
        campaign_ref: item.campaign_ref,
        adset_ref: item.adset_ref,
        page_id: item.page_id ?? ctx.account.defaultPageId ?? '',
        ig_user_id: item.ig_user_id ?? ctx.account.defaultIgUserId ?? null,
      });

      const validateCtx = validateContextFrom(ctx, input.assets, {
        ...(objective ? { objective } : {}),
        variant: variantIndex + 1,
        now,
      });
      const { draft } = applyAutoFields(base, validateCtx);
      const validation = validateItem(draft, validateCtx);

      drafts.push({
        batchId: input.batch.id,
        position,
        campaignRef: draft.campaign_ref,
        adsetRef: draft.adset_ref,
        format: draft.format,
        assetIds: draft.asset_ids,
        copy: draft.copy,
        name: draft.name,
        pageId: draft.page_id,
        igUserId: draft.ig_user_id,
        idempotencyKey: idempotencyKey({
          batchId: input.batch.id,
          position,
          assetIds: draft.asset_ids,
          copy: draft.copy,
        }),
        validation,
        status: statusFromValidation(validation),
      });
      position += 1;
    });
  });

  return drafts;
}

/** FR-008: modo formulário produz os mesmos AdDrafts. */
export async function addManualItems(
  deps: ApiDeps,
  actor: SessionUser,
  input: { batchId: string; items: AdDraftInput[] },
): Promise<AdDraftRow[]> {
  const batch = await getBatch(deps.db, input.batchId);
  if (!batch) throw notFound(`Lote ${input.batchId} não encontrado.`);
  if (input.items.length === 0) throw unprocessable('Nenhum item enviado.');

  const ctx = await loadBatchContext(deps, {
    clientId: batch.clientId,
    adAccountId: batch.adAccountId,
  });
  const assets = await assetsForDrafts(deps, input.items.flatMap((i) => i.asset_ids));
  const existing = await listDraftsOfBatch(deps.db, batch.id);
  const now = deps.now?.() ?? new Date();
  let position = existing.length;

  const rows = input.items.map((item, index) => {
    const validateCtx = validateContextFrom(ctx, assets, { variant: index + 1, now });
    const { draft } = applyAutoFields(adDraftInputSchema.parse(item), validateCtx);
    const validation = validateItem(draft, validateCtx);
    const row = {
      batchId: batch.id,
      position,
      campaignRef: draft.campaign_ref,
      adsetRef: draft.adset_ref,
      format: draft.format,
      assetIds: draft.asset_ids,
      copy: draft.copy,
      name: draft.name,
      pageId: draft.page_id,
      igUserId: draft.ig_user_id,
      idempotencyKey: idempotencyKey({
        batchId: batch.id,
        position,
        assetIds: draft.asset_ids,
        copy: draft.copy,
      }),
      validation,
      status: statusFromValidation(validation),
    };
    position += 1;
    return row;
  });

  const inserted = await insertDrafts(deps.db, rows);
  await refreshBatchStatus(deps.db, batch.id);
  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'batch.items.add',
    entityType: 'batch',
    entityId: batch.id,
    after: { items: inserted.length, mode: 'manual' },
  });
  return inserted;
}
