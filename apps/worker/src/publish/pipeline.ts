import {
  getAccount,
  getAssetsByIds,
  getBatch,
  getClient,
  getDraft,
  countDraftsByStatus,
  refreshBatchStatus,
  saveMetaIds,
  releaseDraft,
  claimDraft,
  setDraftStep,
  transitionDraft,
  upsertPublishJob,
  type AdDraftRow,
  type AssetRow,
} from '@adpub/db';
import { MetaApiError, isTransientError } from '@adpub/meta-client';
import { createAd, createAdCreative } from '@adpub/meta-client/write';
import {
  isPublished,
  nextStep,
  statusForStep,
  type AdsetSpec,
  type CampaignSpec,
  type MetaIds,
  type PublishStep,
} from '@adpub/shared';
import type { CreativeMedia } from '@adpub/meta-client/write';
import type { Alerter } from '../alerts.js';
import type { WorkerContext } from '../context.js';
import type { MetaFactory } from '../meta.js';
import { VideoNotReadyError, ensureImageHash, ensureVideoReady } from './media.js';
import { randomUUID } from 'node:crypto';
import { RefPendingError, ensureAdset, ensureCampaign } from './refs.js';

export interface PublishJobData {
  draftId: string;
  adAccountId: string;
  batchId: string;
}

export class AccountPausedError extends Error {
  constructor(
    readonly adAccountId: string,
    readonly until: Date,
  ) {
    super(`Conta ${adAccountId} pausada até ${until.toISOString()}.`);
    this.name = 'AccountPausedError';
  }
}

export class DraftBusyError extends Error {
  constructor(readonly draftId: string) {
    super(`Item ${draftId} já está em publicação por outro worker. Reagendado.`);
    this.name = 'DraftBusyError';
  }
}

/**
 * Máquina de estados de publicação (R4). Cada etapa persiste o ID retornado
 * antes de avançar: reprocessar retoma na etapa salva e nunca duplica objeto.
 * Constituição I: este é o único caminho de escrita na Meta.
 */
export async function runPublish(
  ctx: WorkerContext,
  meta: MetaFactory,
  alert: Alerter,
  data: PublishJobData,
  attempt: number,
): Promise<{ status: AdDraftRow['status']; adId?: string }> {
  // Uma execução por item: sem isso duas entregas do mesmo job leem `meta_ids`
  // vazio ao mesmo tempo e criam dois anúncios na Meta (SC-004). O dono é por
  // execução — dois jobs do mesmo worker não podem compartilhar o lease.
  const owner = `${process.pid}:${randomUUID()}`;
  if (!(await claimDraft(ctx.db, data.draftId, owner))) throw new DraftBusyError(data.draftId);
  try {
    return await publishLocked(ctx, meta, alert, data, attempt);
  } finally {
    await releaseDraft(ctx.db, data.draftId, owner);
  }
}

async function publishLocked(
  ctx: WorkerContext,
  meta: MetaFactory,
  alert: Alerter,
  data: PublishJobData,
  attempt: number,
): Promise<{ status: AdDraftRow['status']; adId?: string }> {
  const draft = await getDraft(ctx.db, data.draftId);
  if (!draft) throw new Error(`Item ${data.draftId} não existe mais.`);
  if (isPublished(draft.status)) {
    return { status: draft.status, ...(draft.metaIds?.ad_id ? { adId: draft.metaIds.ad_id } : {}) };
  }

  const [batch, account] = await Promise.all([
    getBatch(ctx.db, draft.batchId),
    getAccount(ctx.db, data.adAccountId),
  ]);
  if (!batch) throw new Error(`Lote ${draft.batchId} não existe mais.`);
  if (!account) throw new Error(`Conta ${data.adAccountId} não existe mais.`);
  if (account.pausedUntil && account.pausedUntil.getTime() > Date.now()) {
    throw new AccountPausedError(account.id, account.pausedUntil);
  }

  const client = account.clientId ? await getClient(ctx.db, account.clientId) : undefined;
  const assets = await getAssetsByIds(ctx.db, draft.assetIds);
  const graph = await meta.forAccount(account.id, draft.id);

  let metaIds: MetaIds = {
    ...(draft.metaIds ?? {}),
    image_hashes: draft.metaIds?.image_hashes ?? {},
    video_ids: draft.metaIds?.video_ids ?? {},
    thumbnail_hashes: draft.metaIds?.thumbnail_hashes ?? {},
  };
  let step: PublishStep = draft.step;

  try {
    while (step !== 'done') {
      await upsertPublishJob(ctx.db, {
        adDraftId: draft.id,
        queue: 'adpub.publish',
        step,
        state: 'active',
        attempts: attempt,
      });
      await transitionDraft(ctx.db, draft.id, statusForStep(step), { step, attempts: attempt });

      metaIds = await executeStep(ctx, graph, meta, {
        step,
        draft,
        batch,
        account,
        clientRow: client,
        assets,
        metaIds,
      });

      await saveMetaIds(ctx.db, draft.id, metaIds);
      step = nextStep(step);
      await setDraftStep(ctx.db, draft.id, step);
    }

    const published = await transitionDraft(ctx.db, draft.id, 'published', {
      step: 'done',
      metaIds,
      error: null,
      attempts: attempt,
      publishedAt: new Date(),
    });
    await upsertPublishJob(ctx.db, {
      adDraftId: draft.id,
      queue: 'adpub.publish',
      step: 'done',
      state: 'completed',
      attempts: attempt,
      lastError: null,
    });
    await refreshBatchStatus(ctx.db, batch.id);

    ctx.log.info(
      { draft: draft.id, ad_id: metaIds.ad_id, batch: batch.id },
      'anúncio criado PAUSED',
    );
    return {
      status: published.status,
      ...(metaIds.ad_id ? { adId: metaIds.ad_id } : {}),
    };
  } catch (error) {
    await saveMetaIds(ctx.db, draft.id, metaIds);
    return handleFailure(ctx, meta, alert, {
      error,
      draft,
      step,
      attempt,
      batchId: batch.id,
      accountId: account.id,
      connectionId: account.connectionId,
    });
  }
}

interface StepInput {
  step: PublishStep;
  draft: AdDraftRow;
  batch: NonNullable<Awaited<ReturnType<typeof getBatch>>>;
  account: NonNullable<Awaited<ReturnType<typeof getAccount>>>;
  clientRow: Awaited<ReturnType<typeof getClient>>;
  assets: AssetRow[];
  metaIds: MetaIds;
}

async function executeStep(
  ctx: WorkerContext,
  graph: Awaited<ReturnType<MetaFactory['forAccount']>>,
  _meta: MetaFactory,
  input: StepInput,
): Promise<MetaIds> {
  const { draft, batch, account, assets, metaIds } = input;
  const plan = batch.plan;

  switch (input.step) {
    case 'upload_media': {
      const next: MetaIds = { ...metaIds };
      for (const assetId of draft.assetIds) {
        const asset = assets.find((row) => row.id === assetId);
        if (!asset) throw new Error(`Criativo ${assetId} não está mais na biblioteca.`);
        if (asset.kind === 'image') {
          if (next.image_hashes[assetId]) continue;
          next.image_hashes = {
            ...next.image_hashes,
            [assetId]: await ensureImageHash(ctx, graph, { asset, adAccountId: account.id }),
          };
        } else {
          if (next.video_ids[assetId] && next.thumbnail_hashes[assetId]) continue;
          const result = await ensureVideoReady(ctx, graph, {
            asset,
            adAccountId: account.id,
            ...(draft.updatedAt ? { startedAt: draft.updatedAt } : {}),
          });
          next.video_ids = { ...next.video_ids, [assetId]: result.videoId };
          if (result.thumbnailHash) {
            next.thumbnail_hashes = {
              ...next.thumbnail_hashes,
              [assetId]: result.thumbnailHash,
            };
          }
        }
      }
      return next;
    }

    case 'ensure_campaign': {
      if (metaIds.campaign_id) return metaIds;
      const spec = specForRef<CampaignSpec>(plan?.campaigns, draft.campaignRef);
      const campaignId = await ensureCampaign(ctx, graph, {
        batchId: batch.id,
        adAccountId: account.id,
        ref: draft.campaignRef,
        ...(spec ? { spec } : {}),
      });
      return { ...metaIds, campaign_id: campaignId };
    }

    case 'ensure_adset': {
      if (metaIds.adset_id) return metaIds;
      if (!metaIds.campaign_id) throw new Error('Conjunto sem campanha resolvida.');
      const spec = specForRef<AdsetSpec>(plan?.adsets, draft.adsetRef);
      const adsetId = await ensureAdset(ctx, graph, {
        batchId: batch.id,
        adAccountId: account.id,
        ref: draft.adsetRef,
        campaignId: metaIds.campaign_id,
        pixelId: account.defaultPixelId,
        ...(spec ? { spec } : {}),
      });
      return { ...metaIds, adset_id: adsetId };
    }

    case 'create_creative': {
      if (metaIds.creative_id) return metaIds;
      const creativeId = await createAdCreative(graph, account.id, {
        name: draft.name,
        pageId: draft.pageId,
        igUserId: draft.igUserId,
        format: draft.format,
        copy: draft.copy,
        media: mediaFor(draft, assets, metaIds),
        advantageCreativeOptout: input.clientRow?.advantageCreativeOptout ?? true,
      });
      return { ...metaIds, creative_id: creativeId };
    }

    case 'create_ad': {
      if (metaIds.ad_id) return metaIds;
      if (!metaIds.adset_id || !metaIds.creative_id) {
        throw new Error('Anúncio sem conjunto ou criativo resolvido.');
      }
      const adId = await createAd(graph, account.id, {
        name: draft.name,
        adsetId: metaIds.adset_id,
        creativeId: metaIds.creative_id,
      });
      return { ...metaIds, ad_id: adId };
    }

    default:
      return metaIds;
  }
}

function specForRef<T>(
  specs: ReadonlyArray<T & { key: string }> | undefined,
  ref: AdDraftRow['campaignRef'],
): T | undefined {
  if (ref.kind !== 'new' || !specs) return undefined;
  return specs.find((spec) => spec.key === ref.key);
}

/** R9: monta a mídia do criativo a partir dos IDs já persistidos. */
function mediaFor(draft: AdDraftRow, assets: AssetRow[], metaIds: MetaIds): CreativeMedia {
  if (draft.format === 'carousel') {
    return {
      cards: draft.assetIds.map((assetId, index) => {
        const card = draft.copy.cards?.[index];
        return {
          ...(metaIds.image_hashes[assetId] ? { imageHash: metaIds.image_hashes[assetId] } : {}),
          ...(metaIds.video_ids[assetId] ? { videoId: metaIds.video_ids[assetId] } : {}),
          headline: card?.headline ?? draft.copy.headline,
          description: card?.description ?? draft.copy.description,
          link: card?.link ?? draft.copy.link,
        };
      }),
    };
  }

  const assetId = draft.assetIds[0];
  if (!assetId) throw new Error('Item sem criativo.');
  const asset = assets.find((row) => row.id === assetId);
  if (asset?.kind === 'video' || metaIds.video_ids[assetId]) {
    const videoId = metaIds.video_ids[assetId];
    if (!videoId) throw new Error('Criativo de vídeo sem video_id persistido.');
    return {
      videoId,
      ...(metaIds.thumbnail_hashes[assetId]
        ? { thumbnailHash: metaIds.thumbnail_hashes[assetId] }
        : {}),
    };
  }
  const imageHash = metaIds.image_hashes[assetId];
  if (!imageHash) throw new Error('Criativo de imagem sem image_hash persistido.');
  return { imageHash };
}

interface FailureInput {
  error: unknown;
  draft: AdDraftRow;
  step: PublishStep;
  attempt: number;
  batchId: string;
  accountId: string;
  connectionId: string | null;
}

/**
 * Transiente (rate limit, 5xx, vídeo processando, lock de ref) → relança e o
 * BullMQ reagenda. Permanente → `failed` com erro traduzido e o job termina.
 */
async function handleFailure(
  ctx: WorkerContext,
  meta: MetaFactory,
  alert: Alerter,
  input: FailureInput,
): Promise<never> {
  const { error, draft, step, attempt } = input;

  if (error instanceof VideoNotReadyError || error instanceof RefPendingError) {
    await upsertPublishJob(ctx.db, {
      adDraftId: draft.id,
      queue: 'adpub.publish',
      step,
      state: 'delayed',
      attempts: attempt,
      lastError: { message: error.message, transient: true },
    });
    throw error;
  }

  if (error instanceof MetaApiError && error.isAuth && input.connectionId) {
    await meta.handleAuthFailure(input.connectionId, error.translated.title);
  }

  const transient = isTransientError(error);
  const draftError = {
    ...(error instanceof MetaApiError
      ? error.toDraftError(step)
      : {
          message: error instanceof Error ? error.message : String(error),
          translated: 'Falha ao publicar o anúncio.',
          action: 'Veja os detalhes e reprocesse o item.',
          step,
        }),
  };

  await upsertPublishJob(ctx.db, {
    adDraftId: draft.id,
    queue: 'adpub.publish',
    step,
    state: transient ? 'delayed' : 'failed',
    attempts: attempt,
    lastError: { ...draftError, transient },
  });

  if (!transient) {
    await transitionDraft(ctx.db, draft.id, 'failed', {
      step,
      error: draftError,
      attempts: attempt,
    });
    await refreshBatchStatus(ctx.db, input.batchId);
    await maybeAlertBatch(ctx, alert, input.batchId, input.accountId);
  }

  throw error;
}

/** R17: lote com mais de 20% de falhas vira alerta operacional. */
async function maybeAlertBatch(
  ctx: WorkerContext,
  alert: Alerter,
  batchId: string,
  accountId: string,
): Promise<void> {
  const counts = await countDraftsByStatus(ctx.db, batchId);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const failed = counts.failed ?? 0;
  if (total === 0 || failed / total <= 0.2) return;
  await alert({
    title: 'Lote com muitas falhas',
    detail: `Lote ${batchId} tem ${failed} de ${total} itens em falha (>20%).`,
    severity: 'warning',
    context: { batch_id: batchId, ad_account_id: accountId, counts },
  });
}
