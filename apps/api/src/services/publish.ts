import {
  audit,
  countPublishedToday,
  getAccount,
  getBatch,
  getDraft,
  listDraftsOfBatch,
  setBatchPlanFeedback,
  markDraftsQueued,
  patchBatch,
  refreshBatchStatus,
  transitionDraft,
  type AdDraftRow,
} from '@adpub/db';
import { DEFAULT_DAILY_AD_CAP } from '@adpub/config';
import type { MetaIds, PublishStep, SessionUser } from '@adpub/shared';
import { conflict, notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps, JobRef } from '../lib/deps.js';
import { approvalFingerprint } from './approval.js';

export interface PublishResult {
  batch_id: string;
  queued: number;
  skipped: number;
  jobs: JobRef[];
  daily_remaining: number;
}

const RETRYABLE = new Set(['failed', 'ready']);

/**
 * FR-013/FR-014: enfileira apenas itens `ready`, exige confirmação com a
 * contagem exata e respeita o teto diário por conta.
 */
export async function publishBatch(
  deps: ApiDeps,
  actor: SessionUser,
  input: { batchId: string; onlyFailed?: boolean; confirmCount: number },
): Promise<PublishResult> {
  const batch = await getBatch(deps.db, input.batchId);
  if (!batch) throw notFound(`Lote ${input.batchId} não encontrado.`);
  const account = await getAccount(deps.db, batch.adAccountId);
  if (!account) throw notFound(`Conta ${batch.adAccountId} não encontrada.`);
  if (account.pausedUntil && account.pausedUntil > (deps.now?.() ?? new Date())) {
    throw conflict(
      `Conta pausada até ${account.pausedUntil.toISOString()} (token ou rate limit). Resolva antes de publicar.`,
    );
  }

  const drafts = await listDraftsOfBatch(deps.db, batch.id);
  const eligible = drafts.filter((draft) =>
    input.onlyFailed ? draft.status === 'failed' : RETRYABLE.has(draft.status),
  );
  const blocked = drafts.filter((draft) => draft.status === 'blocked');

  if (eligible.length === 0) {
    throw unprocessable(
      blocked.length > 0
        ? `Nenhum item publicável: ${blocked.length} bloqueado(s) na validação.`
        : 'Nenhum item pronto para publicar.',
    );
  }

  if (input.confirmCount !== eligible.length) {
    throw unprocessable(
      `Confirmação divergente: você confirmou ${input.confirmCount} item(ns), mas ${eligible.length} está(ão) pronto(s).`,
    );
  }

  // T-000-3 (AC-000-04): a aprovação vale para a revisão validada. Qualquer
  // edição após validar muda o conteúdo e exige revalidar — sem exceção.
  if (!batch.approvalFingerprint || approvalFingerprint(drafts) !== batch.approvalFingerprint) {
    throw unprocessable('Lote mudou após a validação — revalide antes de publicar.');
  }

  const cap = account.dailyAdCap ?? DEFAULT_DAILY_AD_CAP;
  const publishedToday = await countPublishedToday(deps.db, account.id);
  const remaining = Math.max(0, cap - publishedToday);
  if (remaining === 0) {
    throw conflict(`Teto diário de ${cap} anúncios já atingido para ${account.id}.`);
  }

  const toQueue = eligible.slice(0, remaining);
  const skipped = eligible.length - toQueue.length;

  await markDraftsQueued(
    deps.db,
    toQueue.map((draft) => draft.id),
  );
  const jobs = await deps.queues.enqueuePublish(
    toQueue.map((draft) => ({
      draftId: draft.id,
      adAccountId: account.id,
      batchId: batch.id,
    })),
  );

  await patchBatch(deps.db, batch.id, { status: 'publishing' });
  await refreshBatchStatus(deps.db, batch.id);

  // A12: publicar fecha o ciclo do plano — veio como a IA entregou (`used`)
  // ou passou por edição humana (`edited`). Campos automáticos contam como
  // inalterados: só entra em `edited` o que a pessoa mexeu. Lote sem plano
  // (modo manual) não entra na conta.
  const humanEdited = toQueue.some((draft) =>
    draft.editedFields.some((field) => !field.startsWith('auto:')),
  );
  const planFeedback = humanEdited ? 'edited' : 'used';
  if (batch.planGenerationId) {
    await setBatchPlanFeedback(deps.db, batch.id, planFeedback);
  }

  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'batch.publish',
    entityType: 'batch',
    entityId: batch.id,
    after: {
      queued: toQueue.length,
      skipped,
      only_failed: Boolean(input.onlyFailed),
      confirmed: input.confirmCount,
      daily_cap: cap,
      published_today: publishedToday,
      plan_feedback: batch.planGenerationId ? planFeedback : null,
    },
  });

  return {
    batch_id: batch.id,
    queued: toQueue.length,
    skipped,
    jobs,
    daily_remaining: Math.max(0, remaining - toQueue.length),
  };
}

export async function retryDraft(
  deps: ApiDeps,
  actor: SessionUser,
  draftId: string,
  draft: AdDraftRow,
  batchId: string,
  adAccountId: string,
): Promise<JobRef> {
  if (draft.status !== 'failed') {
    throw unprocessable(`Item em ${draft.status} — só itens em falha podem ser reprocessados.`);
  }
  await markDraftsQueued(deps.db, [draftId]);
  const [job] = await deps.queues.enqueuePublish([{ draftId, adAccountId, batchId }]);
  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'item.retry',
    entityType: 'ad_draft',
    entityId: draftId,
    before: { status: draft.status, step: draft.step, error: draft.error },
  });
  if (!job) throw unprocessable('Não foi possível enfileirar o reprocessamento.');
  return job;
}

/**
 * T-000-2 (AC-000-03): resolve reconciliação com decisão humana auditada.
 * `adopt` retoma do passo informado com os IDs conferidos na Meta;
 * `discard` encerra como falha com motivo. Nunca recria às cegas.
 */
export async function resolveReconciliation(
  deps: ApiDeps,
  actor: SessionUser,
  input: {
    batchId: string;
    itemId: string;
    adAccountId: string;
    decision: 'adopt' | 'discard';
    metaIds?: MetaIds;
    step?: PublishStep;
    motive: string;
  },
): Promise<{ status: string; job?: JobRef }> {
  const draft = await getDraft(deps.db, input.itemId);
  if (!draft || draft.batchId !== input.batchId) {
    throw notFound(`Item ${input.itemId} não encontrado.`);
  }
  if (draft.status !== 'needs_reconciliation') {
    throw unprocessable(`Item em ${draft.status} — só itens em reconciliação podem ser resolvidos.`);
  }

  if (input.decision === 'adopt') {
    if (!input.metaIds || !input.step || input.step === 'done') {
      throw unprocessable('Adotar exige meta_ids conferidos e etapa de retomada (diferente de done).');
    }
    const updated = await transitionDraft(deps.db, draft.id, 'queued', {
      step: input.step,
      metaIds: input.metaIds,
      error: null,
      attempts: draft.attempts,
    });
    const [job] = await deps.queues.enqueuePublish([
      { draftId: draft.id, adAccountId: input.adAccountId, batchId: input.batchId },
    ]);
    await audit(deps.db, {
      actor: { id: actor.id, email: actor.email },
      action: 'item.resolve',
      entityType: 'ad_draft',
      entityId: draft.id,
      before: { status: draft.status, step: draft.step, error: draft.error },
      after: { decision: 'adopt', step: input.step, meta_ids: input.metaIds, motive: input.motive },
    });
    if (!job) throw unprocessable('Não foi possível enfileirar a retomada.');
    return { status: updated.status, job };
  }

  const updated = await transitionDraft(deps.db, draft.id, 'failed', {
    error: {
      message: input.motive,
      translated: 'Descartado na reconciliação pelo operador.',
      action: '',
      step: draft.step ?? undefined,
    },
    attempts: draft.attempts,
  });
  await refreshBatchStatus(deps.db, input.batchId);
  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'item.resolve',
    entityType: 'ad_draft',
    entityId: draft.id,
    before: { status: draft.status, step: draft.step, error: draft.error },
    after: { decision: 'discard', motive: input.motive },
  });
  return { status: updated.status };
}
