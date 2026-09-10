import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  audit,
  batchWithItems,
  createBatch,
  deleteDraft,
  getAccount,
  getDraft,
  listBatches,
  listDraftsOfBatch,
  listVisibleAccounts,
  patchBatch,
  patchDraft,
  refreshBatchStatus,
} from '@adpub/db';
import {
  adDraftInputSchema,
  batchOptionsSchema,
  batchPlanSchema,
  batchStatusSchema,
  metaIdsSchema,
  publishStepSchema,
  type AdDraftInput,
} from '@adpub/shared';
import { applyAutoFields, statusFromValidation, validateItem } from '@adpub/rules';
import { currentUser } from '../plugins/auth.js';
import { batchDto, draftDto } from '../lib/dto.js';
import { notFound, unprocessable } from '../lib/problem.js';
import { assertAccountAccess, batchInScope } from '../lib/scope.js';
import {
  assetsForDrafts,
  loadBatchContext,
  validateContextFrom,
} from '../services/batch-context.js';
import { addManualItems, generatePlan, setManualPlan } from '../services/batch-plan.js';
import { duplicateBatch } from '../services/duplicate.js';
import { publishBatch, resolveReconciliation, retryDraft } from '../services/publish.js';
import { validateBatch } from '../services/validation.js';
import type { ApiDeps } from '../lib/deps.js';

const idParam = z.object({ id: z.string().uuid() });
const itemParam = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });

const createBody = z.object({
  client_id: z.string().uuid(),
  ad_account_id: z.string().min(1),
  name: z.string().min(1),
  mode: z.enum(['ai', 'manual']),
  briefing: z.string().optional(),
  options: batchOptionsSchema.partial().optional(),
});

const patchBody = z.object({
  name: z.string().min(1).optional(),
  briefing: z.string().nullable().optional(),
  options: batchOptionsSchema.partial().optional(),
  version: z.number().int().nonnegative().optional(),
});

const planBody = z
  .object({
    asset_ids: z.array(z.string().uuid()).default([]),
    copies_per_creative: z.number().int().min(1).max(5).default(3),
    regenerate: z.boolean().default(false),
  })
  .default({ asset_ids: [], copies_per_creative: 3, regenerate: false });

/** T-000-1: contrato de publicação não tem campo de status — ACTIVE nem chega a existir. */
export const publishBody = z
  .object({ only_failed: z.boolean().default(false), confirm_count: z.number().int().min(0) })
  .strict();

/** T-000-2: adotar exige IDs + etapa; descartar exige motivo. */
const resolveBody = z
  .object({
    decision: z.enum(['adopt', 'discard']),
    meta_ids: metaIdsSchema.optional(),
    step: publishStepSchema.optional(),
    motive: z.string().min(1),
  })
  .strict();

export function batchRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/batches', async (request) => {
    const user = currentUser(request);
    const query = z
      .object({
        ad_account_id: z.string().optional(),
        status: batchStatusSchema.optional(),
        mine: z.coerce.boolean().optional(),
      })
      .parse(request.query);

    const visible = await listVisibleAccounts(deps.db, { userId: user.id, role: user.role });
    const accountIds = query.ad_account_id
      ? visible.filter((a) => a.id === query.ad_account_id).map((a) => a.id)
      : visible.map((a) => a.id);

    const rows = await listBatches(deps.db, {
      adAccountIds: accountIds,
      ...(query.status ? { status: query.status } : {}),
      ...(query.mine ? { createdBy: user.id } : {}),
    });
    return rows.map((row) => batchDto(row));
  });

  app.post('/batches', async (request, reply) => {
    const user = currentUser(request);
    const body = createBody.parse(request.body);
    await assertAccountAccess(deps, user, body.ad_account_id);
    const account = await getAccount(deps.db, body.ad_account_id);
    if (!account) throw notFound(`Conta ${body.ad_account_id} não encontrada.`);
    if (account.clientId && account.clientId !== body.client_id) {
      throw unprocessable('A conta selecionada pertence a outro cliente.');
    }

    const row = await createBatch(deps.db, {
      clientId: body.client_id,
      adAccountId: body.ad_account_id,
      createdBy: user.id,
      name: body.name,
      mode: body.mode,
      briefing: body.briefing ?? null,
      options: batchOptionsSchema.parse(body.options ?? {}),
    });
    await audit(deps.db, {
      actor: { id: user.id, email: user.email },
      action: 'batch.create',
      entityType: 'batch',
      entityId: row.id,
      after: { name: row.name, mode: row.mode, ad_account_id: row.adAccountId },
    });
    return reply.status(201).send(batchDto(row));
  });

  app.get('/batches/:id', async (request) => {
    const user = currentUser(request);
    const { id } = idParam.parse(request.params);
    await batchInScope(deps, user, id);
    const result = await batchWithItems(deps.db, id);
    if (!result) throw notFound(`Lote ${id} não encontrado.`);
    return batchDto(result.batch, result.items);
  });

  app.patch('/batches/:id', async (request) => {
    const user = currentUser(request);
    const { id } = idParam.parse(request.params);
    await batchInScope(deps, user, id);
    const body = patchBody.parse(request.body);
    const updated = await patchBatch(deps.db, id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.briefing !== undefined ? { briefing: body.briefing } : {}),
      ...(body.options !== undefined
        ? { options: batchOptionsSchema.parse(body.options) }
        : {}),
      ...(body.version !== undefined ? { expectedVersion: body.version } : {}),
    });
    return batchDto(updated);
  });

  app.post('/batches/:id/plan', async (request) => {
    const user = currentUser(request);
    const { id } = idParam.parse(request.params);
    await batchInScope(deps, user, id);
    const body = planBody.parse(request.body ?? {});
    const result = await generatePlan(deps, user, {
      batchId: id,
      assetIds: body.asset_ids,
      copiesPerCreative: body.copies_per_creative,
      regenerate: body.regenerate,
    });
    return batchDto(result.batch, result.items);
  });

  /** FR-008: construtor manual envia o mesmo BatchPlan que a IA produziria. */
  app.put('/batches/:id/plan', async (request) => {
    const user = currentUser(request);
    const { id } = idParam.parse(request.params);
    await batchInScope(deps, user, id);
    const plan = batchPlanSchema.parse(request.body);
    const result = await setManualPlan(deps, user, { batchId: id, plan });
    return batchDto(result.batch, result.items);
  });

  app.post('/batches/:id/items', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParam.parse(request.params);
    const batch = await batchInScope(deps, user, id);
    const items = z.array(adDraftInputSchema).parse(request.body) as AdDraftInput[];
    const created = await addManualItems(deps, user, { batchId: id, items });
    return reply.status(201).send(created.map((row) => draftDto(row, batch.adAccountId)));
  });

  app.patch('/batches/:id/items/:itemId', async (request) => {
    const user = currentUser(request);
    const { id, itemId } = itemParam.parse(request.params);
    const batch = await batchInScope(deps, user, id);
    const body = adDraftInputSchema
      .partial()
      .extend({ version: z.number().int().nonnegative().optional() })
      .parse(request.body);

    const existing = await getDraft(deps.db, itemId);
    if (!existing || existing.batchId !== id) throw notFound(`Item ${itemId} não encontrado.`);

    const merged = adDraftInputSchema.parse({
      format: body.format ?? existing.format,
      asset_ids: body.asset_ids ?? existing.assetIds,
      copy: body.copy ?? existing.copy,
      name: body.name ?? existing.name,
      campaign_ref: body.campaign_ref ?? existing.campaignRef,
      adset_ref: body.adset_ref ?? existing.adsetRef,
      page_id: body.page_id ?? existing.pageId,
      ig_user_id: body.ig_user_id ?? existing.igUserId,
    });

    const ctx = await loadBatchContext(deps, {
      clientId: batch.clientId,
      adAccountId: batch.adAccountId,
    });
    const assets = await assetsForDrafts(deps, merged.asset_ids);
    const validateCtx = validateContextFrom(ctx, assets, {
      variant: existing.position + 1,
      ...(deps.now ? { now: deps.now() } : {}),
    });
    const { draft } = applyAutoFields(merged, validateCtx);
    const validation = validateItem(draft, validateCtx);

    const editedFields = [
      ...new Set([
        ...existing.editedFields,
        ...Object.keys(body).filter((key) => key !== 'version'),
      ]),
    ];

    const updated = await patchDraft(deps.db, itemId, {
      format: draft.format,
      assetIds: draft.asset_ids,
      copy: draft.copy,
      name: draft.name,
      campaignRef: draft.campaign_ref,
      adsetRef: draft.adset_ref,
      pageId: draft.page_id,
      igUserId: draft.ig_user_id,
      validation,
      status: statusFromValidation(validation),
      editedFields,
      ...(body.version !== undefined ? { expectedVersion: body.version } : {}),
    });
    await refreshBatchStatus(deps.db, id);
    await audit(deps.db, {
      actor: { id: user.id, email: user.email },
      action: 'item.update',
      entityType: 'ad_draft',
      entityId: itemId,
      before: { copy: existing.copy, name: existing.name, status: existing.status },
      after: { copy: updated.copy, name: updated.name, status: updated.status },
    });
    return draftDto(updated, batch.adAccountId);
  });

  app.delete('/batches/:id/items/:itemId', async (request, reply) => {
    const user = currentUser(request);
    const { id, itemId } = itemParam.parse(request.params);
    await batchInScope(deps, user, id);
    const existing = await getDraft(deps.db, itemId);
    if (!existing || existing.batchId !== id) throw notFound(`Item ${itemId} não encontrado.`);
    const removed = await deleteDraft(deps.db, itemId);
    if (!removed) {
      throw unprocessable(`Item em ${existing.status} não pode ser removido.`);
    }
    await refreshBatchStatus(deps.db, id);
    await audit(deps.db, {
      actor: { id: user.id, email: user.email },
      action: 'item.delete',
      entityType: 'ad_draft',
      entityId: itemId,
      before: { position: existing.position, status: existing.status },
    });
    return reply.status(204).send();
  });

  app.post('/batches/:id/items/:itemId/retry', async (request, reply) => {
    const user = currentUser(request);
    const { id, itemId } = itemParam.parse(request.params);
    const batch = await batchInScope(deps, user, id);
    const existing = await getDraft(deps.db, itemId);
    if (!existing || existing.batchId !== id) throw notFound(`Item ${itemId} não encontrado.`);
    const job = await retryDraft(deps, user, itemId, existing, id, batch.adAccountId);
    return reply.status(202).send(job);
  });

  /** T-000-2 (AC-000-03): resolução humana de reconciliação, auditada, sem recriar às cegas. */
  app.post('/batches/:id/items/:itemId/resolve', async (request, reply) => {
    const user = currentUser(request);
    const { id, itemId } = itemParam.parse(request.params);
    const batch = await batchInScope(deps, user, id);
    const body = resolveBody.parse(request.body);
    const result = await resolveReconciliation(deps, user, {
      batchId: id,
      itemId,
      adAccountId: batch.adAccountId,
      decision: body.decision,
      ...(body.meta_ids ? { metaIds: body.meta_ids } : {}),
      ...(body.step ? { step: body.step } : {}),
      motive: body.motive,
    });
    return reply.status(202).send(result);
  });

  app.post('/batches/:id/validate', async (request) => {
    const user = currentUser(request);
    const { id } = idParam.parse(request.params);
    await batchInScope(deps, user, id);
    return validateBatch(deps, user, id);
  });

  app.post('/batches/:id/publish', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParam.parse(request.params);
    await batchInScope(deps, user, id);
    const body = publishBody.parse(request.body);
    const result = await publishBatch(deps, user, {
      batchId: id,
      onlyFailed: body.only_failed,
      confirmCount: body.confirm_count,
    });
    return reply.status(202).send(result);
  });

  app.post('/batches/:id/duplicate', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParam.parse(request.params);
    await batchInScope(deps, user, id);
    const body = z
      .object({ ad_account_id: z.string().min(1), name: z.string().optional() })
      .parse(request.body);
    await assertAccountAccess(deps, user, body.ad_account_id);
    const result = await duplicateBatch(deps, user, {
      batchId: id,
      targetAdAccountId: body.ad_account_id,
      ...(body.name ? { name: body.name } : {}),
    });
    return reply.status(201).send(batchDto(result.batch, result.items));
  });

  /** SSE de progresso (FR-016): snapshot inicial + diffs a cada 1 s. */
  app.get('/batches/:id/events', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParam.parse(request.params);
    await batchInScope(deps, user, id);

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });

    const seen = new Map<string, string>();
    let closed = false;

    const tick = async () => {
      if (closed) return;
      const items = await listDraftsOfBatch(deps.db, id);
      const changed = items.filter((item) => {
        const signature = `${item.status}|${item.step ?? ''}|${item.effectiveStatus ?? ''}|${item.version}`;
        if (seen.get(item.id) === signature) return false;
        seen.set(item.id, signature);
        return true;
      });
      if (changed.length > 0) {
        reply.raw.write(
          `event: items\ndata: ${JSON.stringify(
            changed.map((item) => ({
              item_id: item.id,
              status: item.status,
              step: item.step,
              effective_status: item.effectiveStatus,
              error: item.error,
              attempts: item.attempts,
              meta_ids: item.metaIds,
            })),
          )}\n\n`,
        );
      }
      const done = items.length > 0 && items.every((item) => TERMINAL.has(item.status));
      if (done) {
        reply.raw.write(`event: done\ndata: ${JSON.stringify({ batch_id: id })}\n\n`);
        stop();
      }
    };

    const interval = setInterval(() => {
      void tick();
    }, 1000);
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);

    function stop() {
      if (closed) return;
      closed = true;
      clearInterval(interval);
      clearInterval(heartbeat);
      reply.raw.end();
    }

    request.raw.on('close', stop);
    await tick();
    return reply;
  });
}

const TERMINAL = new Set(['published', 'in_review', 'approved', 'disapproved', 'failed', 'blocked', 'draft', 'ready', 'needs_reconciliation']);
