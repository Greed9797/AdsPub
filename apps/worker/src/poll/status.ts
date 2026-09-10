import { STATUS_POLL } from '@adpub/config';
import {
  activeBindingForDraft,
  draftsForStatusPoll,
  getDraft,
  openBinding,
  transitionDraft,
  type BindingRow,
} from '@adpub/db';
import { getAdsStatus } from '@adpub/meta-client';
import type { AdDraftStatus } from '@adpub/shared';
import type { WorkerContext } from '../context.js';
import type { MetaFactory } from '../meta.js';

export interface StatusPollResult {
  checked: number;
  updated: number;
}

/** FR-018: reflete o resultado da revisão da Meta no item. */
export function statusFromEffective(effective: string | undefined): AdDraftStatus {  switch ((effective ?? '').toUpperCase()) {
    case 'ACTIVE':
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ADSET_PAUSED':
      return 'approved';
    case 'DISAPPROVED':
    case 'WITH_ISSUES':
      return 'disapproved';
    case 'PENDING_REVIEW':
    case 'IN_PROCESS':
    case 'PREAPPROVED':
      return 'in_review';
    default:
      return 'in_review';
  }
}

/**
 * T-002-2 (AC-002-05): criativo trocado fora do app com métrica só diária não
 * pode ser atribuído por versão — marca ambíguo em vez de dividir número.
 * Pura para teste sem banco.
 */
export function detectCreativeChange(
  binding: Pick<BindingRow, 'metaCreativeId' | 'variantId'> | undefined,
  observedCreativeId: string | undefined,
): { changed: boolean; variantId?: string } {
  if (!binding?.metaCreativeId || !observedCreativeId) return { changed: false };
  if (binding.metaCreativeId === observedCreativeId) return { changed: false };
  return { changed: true, variantId: binding.variantId };
}

export async function runStatusPoll(
  ctx: WorkerContext,
  meta: MetaFactory,
): Promise<StatusPollResult> {
  const targets = await draftsForStatusPoll(ctx.db, STATUS_POLL.windowDays);
  const byAccount = new Map<string, Array<{ id: string; adId: string }>>();
  for (const target of targets) {
    const list = byAccount.get(target.adAccountId) ?? [];
    list.push({ id: target.id, adId: target.adId });
    byAccount.set(target.adAccountId, list);
  }

  let updated = 0;

  for (const [adAccountId, items] of byAccount) {
    let graph;
    try {
      graph = await meta.forAccount(adAccountId);
    } catch (error) {
      ctx.log.warn({ err: error, adAccountId }, 'poller sem cliente Graph para a conta');
      continue;
    }

    const statuses = await getAdsStatus(
      graph,
      items.map((item) => item.adId),
    );
    const byAdId = new Map(statuses.map((status) => [status.id, status]));

    for (const item of items) {
      const status = byAdId.get(item.adId);
      if (!status) continue;
      const effective = status.effective_status;
      const target = statusFromEffective(effective);
      const draft = await getDraft(ctx.db, item.id);
      if (!draft) continue;
      // T-002-2: checa troca de criativo antes do atalho — status igual não
      // significa vínculo igual.
      const observedCreativeId = status.creative?.id;
      const binding = await activeBindingForDraft(ctx.db, item.id);
      const change = detectCreativeChange(binding, observedCreativeId);
      if (draft.status === target && draft.effectiveStatus === effective && !change.changed) continue;

      try {
        await transitionDraft(ctx.db, item.id, target, {
          effectiveStatus: effective ?? null,
          reviewFeedback: (status.ad_review_feedback ?? null) as Record<string, unknown> | null,
        });
        updated += 1;
      } catch (error) {
        ctx.log.warn({ err: error, draft: item.id, target }, 'transição de revisão recusada');
      }

      // Troca de criativo observada → vínculo ambíguo, sem dividir métrica.
      if (change.changed && change.variantId) {
        await openBinding(ctx.db, {
          draftId: item.id,
          adAccountId,
          metaAdId: item.adId,
          metaCreativeId: observedCreativeId ?? null,
          variantId: change.variantId,
          precision: 'ambiguous_intraday',
          ambiguityReason:
            'criativo do anúncio trocado fora do app; métrica diária não atribuível por versão',
        });
        updated += 1;
      }
    }
  }

  return { checked: targets.length, updated };
}
