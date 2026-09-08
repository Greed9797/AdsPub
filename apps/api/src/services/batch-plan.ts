import { idempotencyKey } from '@adpub/crypto';
import {
  audit,
  batchWithItems,
  deleteDraftsOfBatch,
  getBatch,
  insertDrafts,
  listDraftsOfBatch,
  patchBatch,
  refreshBatchStatus,
  saveGeneration,
  findCachedGeneration,
  type AdDraftRow,
  type AssetRow,
  type BatchRow,
} from '@adpub/db';
import { applyAutoFields, statusFromValidation, validateItem } from '@adpub/rules';
import {
  adDraftInputSchema,
  type AdDraftInput,
  type BatchPlan,
  type Copy,
  type PlanItem,
  type SessionUser,
} from '@adpub/shared';
import type { AiCache, PlanContext } from '@adpub/ai';
import { notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { assetsForDrafts, loadBatchContext, validateContextFrom } from './batch-context.js';

export function aiCacheFor(deps: ApiDeps, batchId: string | null): AiCache {
  return {
    async find(purpose, promptVersion, inputHash) {
      const row = await findCachedGeneration(deps.db, purpose, promptVersion, inputHash);
      return row ? { output: row.output } : undefined;
    },
    async save(input) {
      await saveGeneration(deps.db, { ...input, batchId });
    },
  };
}

/** FR-006: briefing + criativos + conta → BatchPlan → itens persistidos. */
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

  const ctx = await loadBatchContext(deps, {
    clientId: batch.clientId,
    adAccountId: batch.adAccountId,
  });
  const assets = await assetsForDrafts(deps, input.assetIds);
  if (assets.length === 0) {
    throw unprocessable('Selecione ao menos um criativo válido para gerar o plano.');
  }

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
    })),
    campaigns: ctx.campaigns,
    adsets: ctx.adsets,
  };

  const { plan, meta } = await deps.ai.generatePlan(planContext);
  assertPlanRefs(plan);

  if (existing.length > 0) await deleteDraftsOfBatch(deps.db, batch.id);
  const items = await materializePlan(deps, { batch, plan, assets });

  await patchBatch(deps.db, batch.id, { plan, status: items.length > 0 ? 'draft' : 'blocked' });
  await refreshBatchStatus(deps.db, batch.id);

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

  const existing = await listDraftsOfBatch(deps.db, batch.id);
  if (existing.length > 0) await deleteDraftsOfBatch(deps.db, batch.id);
  const items = await materializePlan(deps, { batch, plan: input.plan, assets });

  await patchBatch(deps.db, batch.id, {
    plan: input.plan,
    status: items.length > 0 ? 'draft' : 'blocked',
  });
  await refreshBatchStatus(deps.db, batch.id);

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

/** Expande o plano em itens: 1 AdDraft por (criativo × variação de copy). */
export async function materializePlan(
  deps: ApiDeps,
  input: { batch: BatchRow; plan: BatchPlan; assets: AssetRow[] },
): Promise<AdDraftRow[]> {
  const ctx = await loadBatchContext(deps, {
    clientId: input.batch.clientId,
    adAccountId: input.batch.adAccountId,
  });
  const objectiveByCampaignKey = new Map(input.plan.campaigns.map((c) => [c.key, c.objective]));
  const now = deps.now?.() ?? new Date();

  const drafts: Array<Parameters<typeof insertDrafts>[1][number]> = [];
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

  return insertDrafts(deps.db, drafts);
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
