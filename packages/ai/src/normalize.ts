import {
  batchPlanSchema,
  copySchema,
  type BatchPlan,
  type PendingField,
  type PlanItem,
} from '@adpub/shared';
import type { PlanContext } from './context.js';

export class AiSchemaError extends Error {
  constructor(
    message: string,
    readonly issues: unknown,
  ) {
    super(message);
    this.name = 'AiSchemaError';
  }
}

export interface NormalizedPlan {
  plan: BatchPlan;
  dropped: string[];
}

/**
 * US3: valida a saída da IA e converte tudo que ela não conseguiu inferir em
 * pendências explícitas. A IA nunca inventa criativo, campanha ou URL.
 */
export function normalizePlan(raw: unknown, ctx: PlanContext): NormalizedPlan {
  const parsed = batchPlanSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AiSchemaError('Plano da IA fora do schema.', parsed.error.issues);
  }

  const plan = parsed.data;
  const knownAssets = new Set(ctx.assets.map((a) => a.id));
  const knownCampaigns = new Set(ctx.campaigns.map((c) => c.id));
  const knownAdsets = new Set(ctx.adsets.map((a) => a.id));
  const campaignKeys = new Set(plan.campaigns.map((c) => c.key));
  const adsetKeys = new Set(plan.adsets.map((a) => a.key));

  const pending: PendingField[] = [...plan.pending];
  const dropped: string[] = [];
  const items: PlanItem[] = [];

  plan.items.forEach((item, index) => {
    const unknownAssets = item.asset_ids.filter((id) => !knownAssets.has(id));
    if (unknownAssets.length > 0) {
      dropped.push(`item ${index}: criativo inexistente (${unknownAssets.join(', ')})`);
      pending.push({
        field: 'asset_ids',
        reason: `A IA referenciou criativo que não está na biblioteca: ${unknownAssets.join(', ')}`,
        item_index: index,
      });
      return;
    }

    if (item.campaign_ref.kind === 'existing' && !knownCampaigns.has(item.campaign_ref.id)) {
      pending.push({
        field: 'campaign_ref',
        reason: `Campanha ${item.campaign_ref.id} não existe no cache da conta.`,
        item_index: index,
      });
      dropped.push(`item ${index}: campanha inexistente`);
      return;
    }
    if (item.campaign_ref.kind === 'new' && !campaignKeys.has(item.campaign_ref.key)) {
      pending.push({
        field: 'campaign_ref',
        reason: `Campanha nova "${item.campaign_ref.key}" sem especificação em campaigns.`,
        item_index: index,
      });
      dropped.push(`item ${index}: campanha nova sem spec`);
      return;
    }
    if (item.adset_ref.kind === 'existing' && !knownAdsets.has(item.adset_ref.id)) {
      pending.push({
        field: 'adset_ref',
        reason: `Conjunto ${item.adset_ref.id} não existe no cache da conta.`,
        item_index: index,
      });
      dropped.push(`item ${index}: conjunto inexistente`);
      return;
    }
    if (item.adset_ref.kind === 'new' && !adsetKeys.has(item.adset_ref.key)) {
      pending.push({
        field: 'adset_ref',
        reason: `Conjunto novo "${item.adset_ref.key}" sem especificação em adsets.`,
        item_index: index,
      });
      dropped.push(`item ${index}: conjunto novo sem spec`);
      return;
    }

    const copies = item.copies.map((copy) => copySchema.parse(copy));
    copies.forEach((copy, copyIndex) => {
      if (!copy.link.trim()) {
        pending.push({
          field: 'copy.link',
          reason: 'A IA não encontrou link de destino no briefing.',
          item_index: index,
        });
      }
      if (copyIndex === 0 && !copy.primary_text.trim()) {
        pending.push({
          field: 'copy.primary_text',
          reason: 'Texto principal não gerado.',
          item_index: index,
        });
      }
    });

    items.push({ ...item, copies });
  });

  if (items.length === 0) {
    pending.push({
      field: 'items',
      reason: 'Nenhum item aproveitável no plano da IA. Revise o briefing ou monte manualmente.',
    });
  }

  return {
    plan: { ...plan, items, pending: dedupePending(pending) },
    dropped,
  };
}

function dedupePending(pending: PendingField[]): PendingField[] {
  const seen = new Set<string>();
  return pending.filter((p) => {
    const key = `${p.field}|${p.item_index ?? '-'}|${p.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
