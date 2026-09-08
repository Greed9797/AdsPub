import { and, desc, eq, sql } from 'drizzle-orm';
import {
  deriveBatchStatus,
  type AdDraftStatus,
  type BatchOptions,
  type BatchPlan,
} from '@adpub/shared';
import { adDrafts, batches } from '../schema.js';
import type { AdDraftRow, BatchRow } from '../schema.js';
import type { Database } from '../client.js';

export class OptimisticLockError extends Error {
  constructor(public readonly entity: string) {
    super(`${entity} foi alterado por outra pessoa. Recarregue e tente de novo.`);
    this.name = 'OptimisticLockError';
  }
}

export async function createBatch(
  db: Database,
  input: {
    clientId: string;
    adAccountId: string;
    createdBy: string | null;
    name: string;
    mode: 'ai' | 'manual';
    briefing?: string | null;
    options: BatchOptions;
    duplicatedFrom?: string | null;
  },
): Promise<BatchRow> {
  const [row] = await db
    .insert(batches)
    .values({
      clientId: input.clientId,
      adAccountId: input.adAccountId,
      createdBy: input.createdBy,
      name: input.name,
      mode: input.mode,
      briefing: input.briefing ?? null,
      options: input.options,
      duplicatedFrom: input.duplicatedFrom ?? null,
      status: 'draft',
    })
    .returning();
  if (!row) throw new Error('Falha ao criar lote.');
  return row;
}

export async function getBatch(db: Database, id: string): Promise<BatchRow | undefined> {
  const [row] = await db.select().from(batches).where(eq(batches.id, id));
  return row;
}

export async function listBatches(
  db: Database,
  filter: { adAccountIds?: readonly string[]; status?: BatchRow['status']; createdBy?: string },
): Promise<BatchRow[]> {
  const filters = [];
  if (filter.adAccountIds) {
    if (filter.adAccountIds.length === 0) return [];
    filters.push(sql`${batches.adAccountId} in ${sql`(${sql.join(filter.adAccountIds.map((id) => sql`${id}`), sql`, `)})`}`);
  }
  if (filter.status) filters.push(eq(batches.status, filter.status));
  if (filter.createdBy) filters.push(eq(batches.createdBy, filter.createdBy));
  return db
    .select()
    .from(batches)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(batches.createdAt))
    .limit(200);
}

export async function patchBatch(
  db: Database,
  id: string,
  patch: {
    name?: string;
    briefing?: string | null;
    options?: BatchOptions;
    plan?: BatchPlan | null;
    status?: BatchRow['status'];
    expectedVersion?: number;
  },
): Promise<BatchRow> {
  const set: Record<string, unknown> = { updatedAt: new Date(), version: sql`${batches.version} + 1` };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.briefing !== undefined) set.briefing = patch.briefing;
  if (patch.options !== undefined) set.options = patch.options;
  if (patch.plan !== undefined) set.plan = patch.plan;
  if (patch.status !== undefined) set.status = patch.status;

  const where =
    patch.expectedVersion === undefined
      ? eq(batches.id, id)
      : and(eq(batches.id, id), eq(batches.version, patch.expectedVersion));

  const [row] = await db.update(batches).set(set).where(where).returning();
  if (!row) throw new OptimisticLockError('Lote');
  return row;
}

/** Status do lote derivado dos itens (data-model). */
export async function refreshBatchStatus(db: Database, batchId: string): Promise<BatchRow['status']> {
  const rows = await db
    .select({ status: adDrafts.status })
    .from(adDrafts)
    .where(eq(adDrafts.batchId, batchId));
  const derived = deriveBatchStatus(rows.map((r) => r.status as AdDraftStatus));
  await db
    .update(batches)
    .set({ status: derived, updatedAt: new Date() })
    .where(eq(batches.id, batchId));
  return derived;
}

export async function batchWithItems(
  db: Database,
  id: string,
): Promise<{ batch: BatchRow; items: AdDraftRow[] } | undefined> {
  const batch = await getBatch(db, id);
  if (!batch) return undefined;
  const items = await db
    .select()
    .from(adDrafts)
    .where(eq(adDrafts.batchId, id))
    .orderBy(adDrafts.position);
  return { batch, items };
}

/** FR-003: teto diário por conta. */
export async function countPublishedToday(db: Database, adAccountId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(adDrafts)
    .innerJoin(batches, eq(adDrafts.batchId, batches.id))
    .where(
      and(
        eq(batches.adAccountId, adAccountId),
        sql`${adDrafts.publishedAt} >= date_trunc('day', now())`,
      ),
    );
  return row?.total ?? 0;
}
