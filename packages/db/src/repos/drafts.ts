import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  assertTransition,
  type AdDraftStatus,
  type Copy,
  type DraftError,
  type ItemValidation,
  type MetaIds,
  type ObjectRef,
  type PublishStep,
} from '@adpub/shared';
import { adDrafts, batches } from '../schema.js';
import type { AdDraftRow } from '../schema.js';
import type { Database } from '../client.js';
import { OptimisticLockError } from './batches.js';

export interface DraftInsert {
  batchId: string;
  position: number;
  campaignRef: ObjectRef;
  adsetRef: ObjectRef;
  format: AdDraftRow['format'];
  assetIds: string[];
  copy: Copy;
  name: string;
  pageId: string;
  igUserId: string | null;
  idempotencyKey: string;
  validation?: ItemValidation | null;
  status?: AdDraftStatus;
}

const EMPTY_META_IDS: MetaIds = { image_hashes: {}, video_ids: {}, thumbnail_hashes: {} };

export async function insertDrafts(db: Database, rows: DraftInsert[]): Promise<AdDraftRow[]> {
  if (rows.length === 0) return [];
  return db
    .insert(adDrafts)
    .values(
      rows.map((r) => ({
        batchId: r.batchId,
        position: r.position,
        campaignRef: r.campaignRef,
        adsetRef: r.adsetRef,
        format: r.format,
        assetIds: r.assetIds,
        copy: r.copy,
        name: r.name,
        pageId: r.pageId,
        igUserId: r.igUserId,
        idempotencyKey: r.idempotencyKey,
        validation: r.validation ?? null,
        status: r.status ?? 'draft',
        metaIds: EMPTY_META_IDS,
      })),
    )
    .returning();
}

export async function deleteDraftsOfBatch(db: Database, batchId: string): Promise<void> {
  await db.delete(adDrafts).where(eq(adDrafts.batchId, batchId));
}

/**
 * Apaga os itens do lote **só** se nenhum estiver em publicação ou publicado.
 *
 * O `for update` trava as linhas dentro da transação: um `POST /publish`
 * concorrente (que faz `UPDATE ... status = 'queued'`) fica bloqueado até o
 * commit, então não existe janela entre a checagem e o delete. Devolve os
 * status que impediram a limpeza (vazio = apagou).
 */
export async function deleteReplaceableDraftsOfBatch(
  db: Database,
  batchId: string,
  blockingStatuses: readonly AdDraftStatus[],
): Promise<AdDraftStatus[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ status: adDrafts.status })
      .from(adDrafts)
      .where(eq(adDrafts.batchId, batchId))
      .for('update');
    const blocking = rows.map((row) => row.status).filter((s) => blockingStatuses.includes(s));
    if (blocking.length > 0) return blocking;
    if (rows.length > 0) await tx.delete(adDrafts).where(eq(adDrafts.batchId, batchId));
    return [];
  });
}

export async function getDraft(db: Database, id: string): Promise<AdDraftRow | undefined> {
  const [row] = await db.select().from(adDrafts).where(eq(adDrafts.id, id));
  return row;
}

export async function listDraftsOfBatch(db: Database, batchId: string): Promise<AdDraftRow[]> {
  return db.select().from(adDrafts).where(eq(adDrafts.batchId, batchId)).orderBy(adDrafts.position);
}

export async function patchDraft(
  db: Database,
  id: string,
  patch: {
    copy?: Copy;
    name?: string;
    campaignRef?: ObjectRef;
    adsetRef?: ObjectRef;
    format?: AdDraftRow['format'];
    assetIds?: string[];
    pageId?: string;
    igUserId?: string | null;
    validation?: ItemValidation | null;
    status?: AdDraftStatus;
    editedFields?: string[];
    expectedVersion?: number;
  },
): Promise<AdDraftRow> {
  const set: Record<string, unknown> = {
    updatedAt: new Date(),
    version: sql`${adDrafts.version} + 1`,
  };
  if (patch.copy !== undefined) set.copy = patch.copy;
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.campaignRef !== undefined) set.campaignRef = patch.campaignRef;
  if (patch.adsetRef !== undefined) set.adsetRef = patch.adsetRef;
  if (patch.format !== undefined) set.format = patch.format;
  if (patch.assetIds !== undefined) set.assetIds = patch.assetIds;
  if (patch.pageId !== undefined) set.pageId = patch.pageId;
  if (patch.igUserId !== undefined) set.igUserId = patch.igUserId;
  if (patch.validation !== undefined) set.validation = patch.validation;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.editedFields !== undefined) set.editedFields = patch.editedFields;

  const where =
    patch.expectedVersion === undefined
      ? eq(adDrafts.id, id)
      : and(eq(adDrafts.id, id), eq(adDrafts.version, patch.expectedVersion));

  const [row] = await db.update(adDrafts).set(set).where(where).returning();
  if (!row) throw new OptimisticLockError('Item do lote');
  return row;
}

export async function deleteDraft(db: Database, id: string): Promise<boolean> {
  const removable: AdDraftStatus[] = ['draft', 'blocked', 'ready', 'queued'];
  const rows = await db
    .delete(adDrafts)
    .where(and(eq(adDrafts.id, id), inArray(adDrafts.status, removable)))
    .returning({ id: adDrafts.id });
  return rows.length > 0;
}

/** Transição validada pela máquina de estados (data-model invariantes). */
export async function transitionDraft(
  db: Database,
  id: string,
  to: AdDraftStatus,
  extra: {
    step?: PublishStep;
    metaIds?: MetaIds;
    error?: DraftError | null;
    attempts?: number;
    effectiveStatus?: string | null;
    reviewFeedback?: Record<string, unknown> | null;
    publishedAt?: Date | null;
  } = {},
): Promise<AdDraftRow> {
  const current = await getDraft(db, id);
  if (!current) throw new Error(`Item ${id} não encontrado.`);
  assertTransition(current.status as AdDraftStatus, to);

  const set: Record<string, unknown> = { status: to, updatedAt: new Date() };
  if (extra.step !== undefined) set.step = extra.step;
  if (extra.metaIds !== undefined) set.metaIds = extra.metaIds;
  if (extra.error !== undefined) set.error = extra.error;
  if (extra.attempts !== undefined) set.attempts = extra.attempts;
  if (extra.effectiveStatus !== undefined) set.effectiveStatus = extra.effectiveStatus;
  if (extra.reviewFeedback !== undefined) set.reviewFeedback = extra.reviewFeedback;
  if (extra.publishedAt !== undefined) set.publishedAt = extra.publishedAt;

  const [row] = await db.update(adDrafts).set(set).where(eq(adDrafts.id, id)).returning();
  if (!row) throw new Error(`Falha ao atualizar item ${id}.`);
  return row;
}

export async function saveMetaIds(
  db: Database,
  id: string,
  metaIds: MetaIds,
): Promise<void> {
  await db.update(adDrafts).set({ metaIds, updatedAt: new Date() }).where(eq(adDrafts.id, id));
}

export async function setDraftStep(db: Database, id: string, step: PublishStep): Promise<void> {
  await db.update(adDrafts).set({ step, updatedAt: new Date() }).where(eq(adDrafts.id, id));
}

export async function draftsToPublish(
  db: Database,
  batchId: string,
  onlyFailed: boolean,
): Promise<AdDraftRow[]> {
  const statuses: AdDraftStatus[] = onlyFailed ? ['failed'] : ['ready', 'failed'];
  return db
    .select()
    .from(adDrafts)
    .where(and(eq(adDrafts.batchId, batchId), inArray(adDrafts.status, statuses)))
    .orderBy(adDrafts.position);
}

/** FR-013: anúncios publicados nos últimos N dias, para o poller. */
export async function draftsForStatusPoll(
  db: Database,
  windowDays: number,
  limit = 500,
): Promise<Array<{ id: string; adId: string; adAccountId: string }>> {
  const rows = await db
    .select({
      id: adDrafts.id,
      metaIds: adDrafts.metaIds,
      adAccountId: batches.adAccountId,
    })
    .from(adDrafts)
    .innerJoin(batches, eq(adDrafts.batchId, batches.id))
    .where(
      and(
        inArray(adDrafts.status, ['published', 'in_review', 'approved', 'disapproved']),
        sql`${adDrafts.publishedAt} > now() - ${sql.raw(`interval '${Math.max(1, Math.trunc(windowDays))} days'`)}`,
      ),
    )
    .limit(limit);

  return rows
    .filter((r) => Boolean(r.metaIds?.ad_id))
    .map((r) => ({ id: r.id, adId: r.metaIds!.ad_id as string, adAccountId: r.adAccountId }));
}

export async function countDraftsByStatus(
  db: Database,
  batchId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: adDrafts.status, total: sql<number>`count(*)::int` })
    .from(adDrafts)
    .where(eq(adDrafts.batchId, batchId))
    .groupBy(adDrafts.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.total]));
}

/**
 * Enfileira em lote: `ready`/`failed` → `queued` num único UPDATE (a confirmação
 * da UI é atômica). O `step` é preservado: o reprocessamento retoma na etapa
 * salva e as etapas já concluídas são puladas por `meta_ids` (idempotência).
 */
export async function markDraftsQueued(db: Database, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(adDrafts)
    .set({
      status: 'queued',
      error: null,
      updatedAt: new Date(),
      version: sql`${adDrafts.version} + 1`,
    })
    .where(and(inArray(adDrafts.id, [...ids]), inArray(adDrafts.status, ['ready', 'failed'])))
    .returning({ id: adDrafts.id });
  return rows.length;
}
