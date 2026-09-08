import { claimRef, getRef, markRefCreated, markRefFailed } from '@adpub/db';
import { createAdSet, createCampaign } from '@adpub/meta-client/write';
import type { MetaClient } from '@adpub/meta-client';
import type { AdsetSpec, CampaignSpec, ObjectRef } from '@adpub/shared';
import type { WorkerContext } from '../context.js';

export class RefPendingError extends Error {
  constructor(readonly refKey: string) {
    super(`Outro item do lote está criando ${refKey}. Reagendado.`);
    this.name = 'RefPendingError';
  }
}

/**
 * R5: dois itens que apontam para a mesma campanha "nova" não criam duas
 * campanhas. Quem ganha o lock cria; os demais reagendam até ver o `meta_id`.
 */
export async function ensureCampaign(
  ctx: WorkerContext,
  client: MetaClient,
  input: { batchId: string; adAccountId: string; ref: ObjectRef; spec?: CampaignSpec },
): Promise<string> {
  if (input.ref.kind === 'existing') return input.ref.id;
  const spec = input.spec;
  if (!spec) throw new Error(`Plano sem especificação da campanha ${input.ref.key}.`);

  const refKey = `campaign:${input.ref.key}`;
  const claim = await claimRef(ctx.db, {
    batchId: input.batchId,
    refKey,
    kind: 'campaign',
    spec: { ...spec },
  });
  if (claim.role === 'ready') return claim.metaId;
  if (claim.role === 'waiting') throw new RefPendingError(refKey);

  try {
    const id = await createCampaign(client, input.adAccountId, spec);
    await markRefCreated(ctx.db, input.batchId, refKey, id);
    return id;
  } catch (error) {
    await markRefFailed(ctx.db, input.batchId, refKey, describe(error));
    throw error;
  }
}

export async function ensureAdset(
  ctx: WorkerContext,
  client: MetaClient,
  input: {
    batchId: string;
    adAccountId: string;
    ref: ObjectRef;
    spec?: AdsetSpec;
    campaignId: string;
    pixelId?: string | null;
  },
): Promise<string> {
  if (input.ref.kind === 'existing') return input.ref.id;
  const spec = input.spec;
  if (!spec) throw new Error(`Plano sem especificação do conjunto ${input.ref.key}.`);

  const refKey = `adset:${input.ref.key}`;
  const claim = await claimRef(ctx.db, {
    batchId: input.batchId,
    refKey,
    kind: 'adset',
    spec: { ...spec, campaign_id: input.campaignId },
  });
  if (claim.role === 'ready') return claim.metaId;
  if (claim.role === 'waiting') throw new RefPendingError(refKey);

  try {
    const id = await createAdSet(client, input.adAccountId, {
      campaignId: input.campaignId,
      spec,
      pixelId: input.pixelId ?? null,
    });
    await markRefCreated(ctx.db, input.batchId, refKey, id);
    return id;
  } catch (error) {
    await markRefFailed(ctx.db, input.batchId, refKey, describe(error));
    throw error;
  }
}

export async function refMetaId(
  ctx: WorkerContext,
  batchId: string,
  refKey: string,
): Promise<string | undefined> {
  const row = await getRef(ctx.db, batchId, refKey);
  return row?.state === 'created' ? (row.metaId ?? undefined) : undefined;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
