import {
  audit,
  countPublishedToday,
  getAccount,
  getBatch,
  listDraftsOfBatch,
  markDraftsQueued,
  patchBatch,
  refreshBatchStatus,
  type AdDraftRow,
} from '@adpub/db';
import { DEFAULT_DAILY_AD_CAP } from '@adpub/config';
import type { SessionUser } from '@adpub/shared';
import { conflict, notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps, JobRef } from '../lib/deps.js';

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
