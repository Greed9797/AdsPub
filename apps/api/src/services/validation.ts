import { POLICY_AI_CONCURRENCY } from '@adpub/config';
import {
  audit,
  getBatch,
  getOrCreateVariant,
  listDraftsOfBatch,
  patchBatch,
  patchDraft,
  refreshBatchStatus,
  type AdDraftRow,
} from '@adpub/db';
import { applyAutoFields, statusFromValidation, validateItem } from '@adpub/rules';
import {
  adDraftInputSchema,
  type ItemValidation,
  type PolicyIssue,
  type SessionUser,
  type ValidationReport,
} from '@adpub/shared';
import { notFound } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { assetsForDrafts, loadBatchContext, validateContextFrom } from './batch-context.js';
import { approvalFingerprint } from './approval.js';

/** FR-009: valida todos os itens do lote e devolve o relatório. */
export async function validateBatch(
  deps: ApiDeps,
  actor: SessionUser,
  batchId: string,
): Promise<ValidationReport> {
  const batch = await getBatch(deps.db, batchId);
  if (!batch) throw notFound(`Lote ${batchId} não encontrado.`);

  const drafts = await listDraftsOfBatch(deps.db, batchId);
  const ctx = await loadBatchContext(deps, {
    clientId: batch.clientId,
    adAccountId: batch.adAccountId,
  });
  const assets = await assetsForDrafts(deps, drafts.flatMap((d) => d.assetIds));
  const now = deps.now?.() ?? new Date();

  const reportItems: ValidationReport['items'] = [];
  const prepared: PreparedItem[] = [];

  // A10: primeiro o barato (regra determinística), item a item. A política
  // por IA vem depois, deduplicada e com concorrência limitada.
  for (const draft of drafts) {
    if (isLocked(draft)) {
      reportItems.push({
        item_id: draft.id,
        status: 'ready',
        errors: [],
        warnings: [],
        policy: draft.validation?.policy ?? [],
      });
      continue;
    }

    const objective = objectiveOf(draft, ctx.campaigns);
    const validateCtx = validateContextFrom(ctx, assets, {
      ...(objective ? { objective } : {}),
      variant: draft.position + 1,
      now,
    });

    const input = adDraftInputSchema.parse({
      format: draft.format,
      asset_ids: draft.assetIds,
      copy: draft.copy,
      name: draft.name,
      campaign_ref: draft.campaignRef,
      adset_ref: draft.adsetRef,
      page_id: draft.pageId,
      ig_user_id: draft.igUserId,
    });

    const { draft: filled, applied } = applyAutoFields(input, validateCtx);
    prepared.push({
      draft,
      filled,
      applied,
      validation: validateItem(filled, validateCtx),
    });
  }

  if (deps.env.usePolicyAi && deps.ai && prepared.length > 0) {
    const policyContext = {
      policyMode: ctx.client.policyMode,
      forbiddenTerms: ctx.client.voiceProfile.forbidden_terms ?? [],
      clientId: ctx.client.id,
      batchId: batch.id,
    };
    const texts = prepared.map((item) => policyText(item.filled));
    const byText = await classifyUniqueTexts(deps, texts, policyContext);
    prepared.forEach((item, index) => {
      const outcome = byText.get(dedupeKey(texts[index] ?? ''));
      item.validation = applyPolicyOutcome(item.validation, outcome, policyContext);
    });
  }

  for (const item of prepared) {
    const { draft, filled, applied, validation } = item;
    const status = statusFromValidation(validation);
    // T-002-1: variante deriva do conteúdo validado; sem conteúdo válido, sem variante.
    const variant =
      status === 'ready'
        ? await getOrCreateVariant(deps.db, batch.clientId, {
            format: filled.format,
            assetIds: filled.asset_ids,
            copy: filled.copy,
            pageId: filled.page_id,
            igUserId: filled.ig_user_id,
            offerContext: null,
          })
        : null;
    await patchDraft(deps.db, draft.id, {
      copy: filled.copy,
      name: filled.name,
      pageId: filled.page_id,
      igUserId: filled.ig_user_id,
      validation,
      status,
      validatedAt: now,
      variantId: variant?.id ?? null,
      editedFields: mergeEdited(draft.editedFields, applied),
    });

    reportItems.push({
      item_id: draft.id,
      status,
      errors: validation.errors,
      warnings: validation.warnings,
      policy: validation.policy,
      ...(validation.suggested_name ? { suggested_name: validation.suggested_name } : {}),
    });
  }

  await refreshBatchStatus(deps.db, batchId);
  const canPublish = reportItems.length > 0 && reportItems.every((item) => item.status === 'ready');

  // T-000-3: congela a revisão aprovada — publicar exige este fingerprint.
  const fresh = await listDraftsOfBatch(deps.db, batchId);
  await patchBatch(deps.db, batchId, {
    approvalFingerprint: approvalFingerprint(fresh),
    validatedAt: now,
  });

  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'batch.validate',
    entityType: 'batch',
    entityId: batchId,
    after: {
      can_publish: canPublish,
      blocked: reportItems.filter((i) => i.status === 'blocked').length,
      items: reportItems.length,
    },
  });

  return { can_publish: canPublish, items: reportItems };
}

/** Texto que o classificador de política lê (as três partes visíveis da copy). */
export function policyText(draft: ReturnType<typeof adDraftInputSchema.parse>): string {
  return [draft.copy.primary_text, draft.copy.headline, draft.copy.description]
    .filter(Boolean)
    .join('\n');
}

/** Chave de deduplicação: espaço em branco não faz um texto ser outro. */
export function dedupeKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export type PolicyOutcome = { issues: PolicyIssue[] } | { unavailable: true };

/**
 * A10: roda com teto de paralelismo e nunca excede o limite pedido. A ordem
 * do resultado é a ordem da entrada.
 */
export async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * A10: cada texto distinto é classificado uma vez, com no máximo
 * `POLICY_AI_CONCURRENCY` chamadas em voo. Falha do classificador não vira
 * "sem achado": fica registrada como indisponibilidade.
 */
export async function classifyUniqueTexts(
  deps: ApiDeps,
  texts: readonly string[],
  context: { forbiddenTerms: string[]; clientId: string; batchId: string },
): Promise<Map<string, PolicyOutcome>> {
  const unique = [...new Map(texts.map((text) => [dedupeKey(text), text] as const)).entries()]
    .filter(([key]) => key.length > 0)
    .map(([, text]) => text);
  if (!deps.ai || unique.length === 0) return new Map();

  const classified = await mapLimited(unique, POLICY_AI_CONCURRENCY, async (text) => {
    try {
      const { issues } = await deps.ai!.classifyPolicy(text, {
        forbiddenTerms: context.forbiddenTerms,
        scope: context.clientId,
        batchId: context.batchId,
      });
      return [dedupeKey(text), { issues } as PolicyOutcome] as const;
    } catch {
      return [dedupeKey(text), { unavailable: true } as PolicyOutcome] as const;
    }
  });
  return new Map(classified);
}

/**
 * A10 (contrato): com `policyMode = block`, classificador fora do ar não vira
 * "passou" — o item fica bloqueado para revisão humana. Em `warn`, é aviso.
 */
export function applyPolicyOutcome(
  validation: ItemValidation,
  outcome: PolicyOutcome | undefined,
  context: { policyMode: 'warn' | 'block' },
): ItemValidation {
  if (!outcome) return validation;

  if ('unavailable' in outcome) {
    const issue = {
      code: 'policy.ai_unavailable',
      field: 'copy',
      message:
        context.policyMode === 'block'
          ? 'Classificador de política indisponível — item bloqueado até revisão humana.'
          : 'Classificador de política indisponível — validado apenas por regras.',
      fix:
        context.policyMode === 'block'
          ? 'Revalide quando o classificador voltar ou revise a copy manualmente.'
          : '',
    };
    return context.policyMode === 'block'
      ? { ...validation, errors: [...validation.errors, issue] }
      : { ...validation, warnings: [...validation.warnings, issue] };
  }

  const extraErrors = [...validation.errors];
  const extraWarnings = [...validation.warnings];
  for (const issue of outcome.issues) {
    const asIssue = {
      code: `policy.ai.${issue.category}`,
      field: 'copy',
      message: `Política IA (${issue.category}): "${issue.excerpt}"`,
      fix: 'Reescreva o trecho para reduzir risco de reprovação.',
    };
    if (
      issue.severity === 'error' ||
      (context.policyMode === 'block' && issue.severity === 'warning')
    ) {
      extraErrors.push(asIssue);
    } else if (issue.severity !== 'info') {
      extraWarnings.push(asIssue);
    }
  }
  return {
    ...validation,
    errors: extraErrors,
    warnings: extraWarnings,
    policy: [...validation.policy, ...outcome.issues],
  };
}

interface PreparedItem {
  draft: AdDraftRow;
  filled: ReturnType<typeof adDraftInputSchema.parse>;
  applied: string[];
  validation: ItemValidation;
}

function isLocked(draft: AdDraftRow): boolean {
  return ['queued', 'uploading_media', 'ensuring_campaign', 'ensuring_adset', 'creating_creative', 'creating_ad', 'published', 'in_review', 'approved', 'disapproved'].includes(
    draft.status,
  );
}

function objectiveOf(
  draft: AdDraftRow,
  campaigns: Array<{ id: string; objective?: string }>,
): string | undefined {
  const ref = draft.campaignRef;
  if (ref.kind !== 'existing') return undefined;
  return campaigns.find((campaign) => campaign.id === ref.id)?.objective;
}

function mergeEdited(current: string[], applied: string[]): string[] {
  return [...new Set([...current, ...applied.map((field) => `auto:${field}`)])];
}
