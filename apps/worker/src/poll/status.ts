import { STATUS_POLL } from '@adpub/config';
import { draftsForStatusPoll, getDraft, transitionDraft } from '@adpub/db';
import { getAdsStatus } from '@adpub/meta-client';
import type { AdDraftStatus } from '@adpub/shared';
import type { WorkerContext } from '../context.js';
import type { MetaFactory } from '../meta.js';

export interface StatusPollResult {
  checked: number;
  updated: number;
}

/** FR-018: reflete o resultado da revisão da Meta no item. */
export function statusFromEffective(effective: string | undefined): AdDraftStatus {
  switch ((effective ?? '').toUpperCase()) {
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
      if (draft.status === target && draft.effectiveStatus === effective) continue;

      try {
        await transitionDraft(ctx.db, item.id, target, {
          effectiveStatus: effective ?? null,
          reviewFeedback: (status.ad_review_feedback ?? null) as Record<string, unknown> | null,
        });
        updated += 1;
      } catch (error) {
        ctx.log.warn({ err: error, draft: item.id, target }, 'transição de revisão recusada');
      }
    }
  }

  return { checked: targets.length, updated };
}
