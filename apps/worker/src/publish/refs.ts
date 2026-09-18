import {
  claimRef,
  getRef,
  lostMetaWrite,
  markRefCreated,
  markRefFailed,
  markRefReconcile,
  refWriteKey,
} from '@adpub/db';
import { createAdSet, createCampaign } from '@adpub/meta-client/write';
import { isAmbiguousError, type MetaClient } from '@adpub/meta-client';
import type { AdsetSpec, CampaignSpec, ObjectRef } from '@adpub/shared';
import type { WorkerContext } from '../context.js';
import { withMetaWrite } from './write-log.js';

export class RefPendingError extends Error {
  constructor(
    readonly refKey: string,
    readonly until: Date | null = null,
  ) {
    super(`Outro item do lote está criando ${refKey}. Reagendado.`);
    this.name = 'RefPendingError';
  }
}

/**
 * Ref compartilhada com create sem resposta: a campanha/conjunto pode já
 * existir na Meta. Recriar duplicaria o objeto para todos os itens do lote, e
 * esperar não resolve — quem decide é humano, com o que viu na Meta.
 */
export class RefReconciliationRequiredError extends Error {
  constructor(
    readonly batchId: string,
    readonly refKey: string,
  ) {
    super(`Ref ${refKey} precisa de reconciliação: possível create sem resposta.`);
    this.name = 'RefReconciliationRequiredError';
  }
}

/**
 * R5: dois itens que apontam para a mesma campanha "nova" não criam duas
 * campanhas. Quem ganha o lock cria; os demais reagendam até ver o `meta_id`.
 */
export async function ensureCampaign(
  ctx: WorkerContext,
  client: MetaClient,
  input: {
    batchId: string;
    adAccountId: string;
    ref: ObjectRef;
    spec?: CampaignSpec;
    owner: string;
  },
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
    owner: input.owner,
  });
  if (claim.role === 'ready') return claim.metaId;
  if (claim.role === 'blocked') throw new RefReconciliationRequiredError(input.batchId, refKey);
  if (claim.role === 'waiting') throw new RefPendingError(refKey, claim.until);

  // Posse reassumida não distingue "dono morreu antes do POST" de "morreu
  // depois": sem consultar a escrita registrada, recriar duplicaria a campanha
  // para todo o lote.
  await assertRefWriteResolved(ctx, input.batchId, refKey);

  try {
    const id = await withMetaWrite(
      ctx,
      {
        writeKey: refWriteKey(input.batchId, refKey),
        method: 'POST',
        endpoint: `${input.adAccountId}/campaigns`,
        adAccountId: input.adAccountId,
      },
      () => createCampaign(client, input.adAccountId, spec),
    );
    await markRefCreated(ctx.db, input.batchId, refKey, id);
    return id;
  } catch (error) {
    await registerRefFailure(ctx, input.batchId, refKey, error);
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
    owner: string;
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
    owner: input.owner,
  });
  if (claim.role === 'ready') return claim.metaId;
  if (claim.role === 'blocked') throw new RefReconciliationRequiredError(input.batchId, refKey);
  if (claim.role === 'waiting') throw new RefPendingError(refKey, claim.until);

  await assertRefWriteResolved(ctx, input.batchId, refKey);

  try {
    const id = await withMetaWrite(
      ctx,
      {
        writeKey: refWriteKey(input.batchId, refKey),
        method: 'POST',
        endpoint: `${input.adAccountId}/adsets`,
        adAccountId: input.adAccountId,
      },
      () =>
        createAdSet(client, input.adAccountId, {
          campaignId: input.campaignId,
          spec,
          pixelId: input.pixelId ?? null,
        }),
    );
    await markRefCreated(ctx.db, input.batchId, refKey, id);
    return id;
  } catch (error) {
    await registerRefFailure(ctx, input.batchId, refKey, error);
    throw error;
  }
}

/**
 * Escrita registrada e sem desfecho: o objeto pode existir na Meta. Congela a
 * ref em vez de recriar — a saída é a decisão humana em `resolveRef`.
 */
async function assertRefWriteResolved(
  ctx: WorkerContext,
  batchId: string,
  refKey: string,
): Promise<void> {
  const lost = await lostMetaWrite(ctx.db, refWriteKey(batchId, refKey));
  if (!lost) return;
  await markRefReconcile(
    ctx.db,
    batchId,
    refKey,
    `${lost.method} ${lost.endpoint} enviada em ${lost.sentAt.toISOString()} sem desfecho conhecido.`,
  );
  throw new RefReconciliationRequiredError(batchId, refKey);
}

/**
 * Erro ambíguo (timeout/rede depois do POST) congela a ref em reconciliação:
 * marcar `failed` aqui liberaria o próximo item para criar o segundo objeto na
 * Meta. Erro claro continua `failed` e o próximo item reassume a criação.
 */
async function registerRefFailure(
  ctx: WorkerContext,
  batchId: string,
  refKey: string,
  error: unknown,
): Promise<void> {
  if (isAmbiguousError(error)) {
    await markRefReconcile(ctx.db, batchId, refKey, describe(error));
    return;
  }
  await markRefFailed(ctx.db, batchId, refKey, describe(error));
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
