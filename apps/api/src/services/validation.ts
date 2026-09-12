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
    let validation: ItemValidation = validateItem(filled, validateCtx);

    if (deps.env.usePolicyAi && deps.ai) {
      validation = await withAiPolicy(deps, validation, filled, {
        policyMode: ctx.client.policyMode,
        forbiddenTerms: ctx.client.voiceProfile.forbidden_terms ?? [],
        clientId: ctx.client.id,
      });
    }

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

async function withAiPolicy(
  deps: ApiDeps,
  validation: ItemValidation,
  draft: ReturnType<typeof adDraftInputSchema.parse>,
  context: { policyMode: 'warn' | 'block'; forbiddenTerms: string[]; clientId: string },
): Promise<ItemValidation> {
  const { policyMode, forbiddenTerms, clientId } = context;
  const text = [draft.copy.primary_text, draft.copy.headline, draft.copy.description]
    .filter(Boolean)
    .join('\n');
  if (!text.trim() || !deps.ai) return validation;

  try {
    const { issues } = await deps.ai.classifyPolicy(text, {
      forbiddenTerms,
      scope: clientId,
    });
    const extraErrors = [...validation.errors];
    const extraWarnings = [...validation.warnings];
    for (const issue of issues) {
      const asIssue = {
        code: `policy.ai.${issue.category}`,
        field: 'copy',
        message: `Política IA (${issue.category}): "${issue.excerpt}"`,
        fix: 'Reescreva o trecho para reduzir risco de reprovação.',
      };
      if (issue.severity === 'error' || (policyMode === 'block' && issue.severity === 'warning')) {
        extraErrors.push(asIssue);
      } else if (issue.severity !== 'info') {
        extraWarnings.push(asIssue);
      }
    }
    return {
      ...validation,
      errors: extraErrors,
      warnings: extraWarnings,
      policy: [...validation.policy, ...issues],
    };
  } catch {
    return {
      ...validation,
      warnings: [
        ...validation.warnings,
        {
          code: 'policy.ai_unavailable',
          field: 'copy',
          message: 'Classificador de política indisponível — validado apenas por regras.',
          fix: '',
        },
      ],
    };
  }
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
