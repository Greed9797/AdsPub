import { createHash } from 'node:crypto';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { stableJson } from '@adpub/shared';
import { accountSyncState, insightSnapshots, metricObservations } from '../schema.js';
import type { Database } from '../client.js';

export type SnapshotRow = typeof insightSnapshots.$inferSelect;

export interface SnapshotInput {
  clientId: string;
  adAccountId?: string | null;
  level: string;
  fields: string[];
  dateStart: string;
  dateStop: string;
  grain: string;
  attribution: string;
  breakdownSignature?: string;
  completeness?: string;
  pages?: number;
  sourceParams?: Record<string, unknown>;
}

/** Fingerprint da consulta: mesma célula = mesmo fingerprint. */
export function snapshotFingerprint(input: Omit<SnapshotInput, 'clientId'> & { clientId?: string }): string {
  return createHash('sha256')
    .update(
      stableJson({
        account: input.adAccountId ?? null,
        level: input.level,
        fields: [...input.fields].sort(),
        since: input.dateStart,
        until: input.dateStop,
        grain: input.grain,
        attribution: input.attribution,
        breakdowns: input.breakdownSignature ?? '',
      }),
    )
    .digest('hex');
}

export async function createSnapshot(db: Database, input: SnapshotInput): Promise<SnapshotRow> {
  const [row] = await db
    .insert(insightSnapshots)
    .values({
      clientId: input.clientId,
      adAccountId: input.adAccountId ?? null,
      fingerprint: snapshotFingerprint(input),
      level: input.level,
      fields: input.fields,
      dateStart: input.dateStart,
      dateStop: input.dateStop,
      grain: input.grain,
      attribution: input.attribution,
      breakdownSignature: input.breakdownSignature ?? '',
      completeness: input.completeness ?? 'complete',
      pages: input.pages ?? 1,
      sourceParams: input.sourceParams ?? {},
    })
    .returning();
  if (!row) throw new Error('Falha ao criar snapshot.');
  return row;
}

export interface ApiObservation {
  clientId: string;
  adAccountId?: string | null;
  importId?: string | null;
  localRowId: string;
  adId?: string | null;
  adName: string;
  entityLevel: string;
  dateStart: string;
  dateStop: string;
  grain: string;
  attribution: string;
  currency?: string;
  breakdownSignature?: string;
  metrics: Record<string, number | string>;
  snapshotId?: string | null;
}

/**
 * T-004-2: mesma célula+fonte aponta p/ o snapshot novo (upsert pela chave
 * canônica cliente+fonte+linha). O relatório salvo segue imutável porque
 * copia os valores na emissão (SPEC-007); aqui só a seleção atual anda.
 */
export async function upsertApiObservations(db: Database, rows: ApiObservation[]): Promise<number> {
  if (rows.length === 0) return 0;
  await db
    .insert(metricObservations)
    .values(
      rows.map((row) => ({
        clientId: row.clientId,
        adAccountId: row.adAccountId ?? null,
        importId: row.importId ?? null,
        localRowId: row.localRowId,
        adId: row.adId ?? null,
        adName: row.adName,
        entityLevel: row.entityLevel,
        dateStart: row.dateStart,
        dateStop: row.dateStop,
        grain: row.grain,
        attribution: row.attribution,
        coverage: 'all',
        currency: row.currency ?? 'unknown',
        breakdownSignature: row.breakdownSignature ?? '',
        metricDefinitionVersion: 'v1',
        metrics: row.metrics,
        source: 'api',
        snapshotId: row.snapshotId ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: [
        metricObservations.clientId,
        metricObservations.source,
        metricObservations.localRowId,
      ],
      set: {
        importId: sql`excluded.import_id`,
        adName: sql`excluded.ad_name`,
        metrics: sql`excluded.metrics`,
        snapshotId: sql`excluded.snapshot_id`,
        observedAt: sql`now()`,
      },
    });
  return rows.length;
}

export async function listObservations(
  db: Database,
  filter: { adAccountId: string; source?: string; from?: string; to?: string; limit?: number },
): Promise<Array<typeof metricObservations.$inferSelect>> {
  const conditions = [eq(metricObservations.adAccountId, filter.adAccountId)];
  if (filter.source) conditions.push(eq(metricObservations.source, filter.source));
  if (filter.from) conditions.push(gte(metricObservations.dateStart, filter.from));
  if (filter.to) conditions.push(lte(metricObservations.dateStop, filter.to));
  return db
    .select()
    .from(metricObservations)
    .where(and(...conditions))
    .orderBy(metricObservations.dateStart)
    .limit(Math.min(filter.limit ?? 500, 2000));
}

export async function getSyncState(db: Database, adAccountId: string) {
  const [row] = await db.select().from(accountSyncState).where(eq(accountSyncState.adAccountId, adAccountId));
  return row;
}

export async function saveSyncState(
  db: Database,
  adAccountId: string,
  patch: Partial<{
    lastDailyCovered: string | null;
    movingWindowStart: string | null;
    movingWindowEnd: string | null;
    pendingReportRunId: string | null;
    consecutiveFailures: number;
  }>,
): Promise<void> {
  await db
    .insert(accountSyncState)
    .values({ adAccountId, ...patch })
    .onConflictDoUpdate({
      target: accountSyncState.adAccountId,
      set: { ...patch, updatedAt: new Date() },
    });
}
