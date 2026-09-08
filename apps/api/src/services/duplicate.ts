import { idempotencyKey } from '@adpub/crypto';
import {
  audit,
  batchWithItems,
  createBatch,
  getAccount,
  getBatch,
  insertDrafts,
  listDraftsOfBatch,
  refreshBatchStatus,
  type AdDraftRow,
  type BatchRow,
} from '@adpub/db';
import { applyAutoFields, statusFromValidation, validateItem } from '@adpub/rules';
import { adDraftInputSchema, type SessionUser } from '@adpub/shared';
import { notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { assetsForDrafts, loadBatchContext, validateContextFrom } from './batch-context.js';

/**
 * US7/FR-025: duplicar um lote para outra conta reaproveita copies e criativos,
 * mas revalida tudo (página, pixel, nomenclatura mudam por conta).
 */
export async function duplicateBatch(
  deps: ApiDeps,
  actor: SessionUser,
  input: { batchId: string; targetAdAccountId: string; name?: string },
): Promise<{ batch: BatchRow; items: AdDraftRow[] }> {
  const source = await getBatch(deps.db, input.batchId);
  if (!source) throw notFound(`Lote ${input.batchId} não encontrado.`);

  const target = await getAccount(deps.db, input.targetAdAccountId);
  if (!target) throw notFound(`Conta ${input.targetAdAccountId} não encontrada.`);
  if (target.clientId !== source.clientId) {
    throw unprocessable('A conta de destino pertence a outro cliente.');
  }

  const sourceItems = await listDraftsOfBatch(deps.db, source.id);
  if (sourceItems.length === 0) throw unprocessable('O lote de origem não tem itens.');

  const copy = await createBatch(deps.db, {
    name: input.name ?? `${source.name} (cópia)`,
    clientId: source.clientId,
    adAccountId: target.id,
    createdBy: actor.id,
    mode: source.mode,
    briefing: source.briefing,
    options: source.options,
    duplicatedFrom: source.id,
  });

  const ctx = await loadBatchContext(deps, {
    clientId: source.clientId,
    adAccountId: target.id,
  });
  const assets = await assetsForDrafts(deps, sourceItems.flatMap((item) => item.assetIds));
  const now = deps.now?.() ?? new Date();

  const rows = sourceItems.map((item, index) => {
    const validateCtx = validateContextFrom(ctx, assets, { variant: index + 1, now });
    const parsed = adDraftInputSchema.parse({
      format: item.format,
      asset_ids: item.assetIds,
      copy: item.copy,
      name: '',
      campaign_ref:
        item.campaignRef.kind === 'existing'
          ? { kind: 'new', key: `dup-${index}`, name: item.name || copy.name }
          : item.campaignRef,
      adset_ref:
        item.adsetRef.kind === 'existing'
          ? { kind: 'new', key: `dup-adset-${index}`, name: item.name || copy.name }
          : item.adsetRef,
      page_id: ctx.account.defaultPageId ?? '',
      ig_user_id: ctx.account.defaultIgUserId ?? null,
    });
    const { draft } = applyAutoFields(parsed, validateCtx);
    const validation = validateItem(draft, validateCtx);
    return {
      batchId: copy.id,
      position: index,
      campaignRef: draft.campaign_ref,
      adsetRef: draft.adset_ref,
      format: draft.format,
      assetIds: draft.asset_ids,
      copy: draft.copy,
      name: draft.name,
      pageId: draft.page_id,
      igUserId: draft.ig_user_id,
      idempotencyKey: idempotencyKey({
        batchId: copy.id,
        position: index,
        assetIds: draft.asset_ids,
        copy: draft.copy,
      }),
      validation,
      status: statusFromValidation(validation),
    };
  });

  await insertDrafts(deps.db, rows);
  await refreshBatchStatus(deps.db, copy.id);
  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'batch.duplicate',
    entityType: 'batch',
    entityId: copy.id,
    after: { from: source.id, to_account: target.id, items: rows.length },
  });

  const result = await batchWithItems(deps.db, copy.id);
  if (!result) throw notFound(`Lote ${copy.id} desapareceu.`);
  return result;
}
