import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { ReportImportContext } from '@adpub/reports';
import { metricObservations, reportImports, reportRows } from '../schema.js';
import type { Database } from '../client.js';

export type ReportImportRow = typeof reportImports.$inferSelect;
export type ReportRowRow = typeof reportRows.$inferSelect;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function createReportImport(
  db: Database,
  input: {
    clientId: string;
    adAccountId?: string | null;
    filename: string;
    mime: string;
    sizeBytes: number;
    sha256: string;
    storageKey: string;
    context: ReportImportContext;
    mapping: Record<string, string | null>;
    mappingVersion: string;
    createdBy?: string | null;
  },
): Promise<ReportImportRow> {
  const [row] = await db
    .insert(reportImports)
    .values({
      clientId: input.clientId,
      adAccountId: input.adAccountId ?? null,
      filename: input.filename,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      storageKey: input.storageKey,
      status: 'uploaded',
      context: input.context,
      mapping: input.mapping,
      mappingVersion: input.mappingVersion,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  if (!row) throw new Error('Falha ao criar importação.');
  return row;
}

export async function getReportImport(db: Database, id: string): Promise<ReportImportRow | undefined> {
  const [row] = await db.select().from(reportImports).where(eq(reportImports.id, id));
  return row;
}

export async function findCommittedImport(
  db: Database,
  clientId: string,
  sha256: string,
  mappingVersion: string,
): Promise<ReportImportRow | undefined> {
  const [row] = await db
    .select()
    .from(reportImports)
    .where(
      and(
        eq(reportImports.clientId, clientId),
        eq(reportImports.sha256, sha256),
        eq(reportImports.mappingVersion, mappingVersion),
        eq(reportImports.status, 'committed'),
      ),
    )
    .limit(1);
  return row;
}

export async function replaceImportRows(
  db: Database,
  importId: string,
  rows: Array<{
    rowNumber: number;
    raw: Record<string, string>;
    mapped: ReportRowRow['mapped'];
    status: string;
    errors: ReportRowRow['errors'];
  }>,
): Promise<void> {
  await db.delete(reportRows).where(eq(reportRows.importId, importId));
  if (rows.length === 0) return;
  await db.insert(reportRows).values(
    rows.map((row) => ({
      importId,
      rowNumber: row.rowNumber,
      raw: row.raw,
      mapped: row.mapped,
      status: row.status,
      errors: row.errors,
    })),
  );
}

export async function listImportRows(db: Database, importId: string): Promise<ReportRowRow[]> {
  return db.select().from(reportRows).where(eq(reportRows.importId, importId)).orderBy(reportRows.rowNumber);
}

export async function setImportMapping(
  db: Database,
  importId: string,
  mapping: Record<string, string | null>,
  mappingVersion: string,
): Promise<void> {
  await db
    .update(reportImports)
    .set({ mapping, mappingVersion, status: 'mapped', updatedAt: new Date() })
    .where(eq(reportImports.id, importId));
}

export async function markImportCommitted(db: Database, importId: string): Promise<void> {
  await db.update(reportImports).set({ status: 'committed', updatedAt: new Date() }).where(eq(reportImports.id, importId));
}

export async function insertObservations(
  db: Database,
  rows: Array<typeof metricObservations.$inferInsert>,
): Promise<number> {
  if (rows.length === 0) return 0;
  // Recommit idempotente: mesma revisão não duplica (unique import+linha).
  await db.insert(metricObservations).values(rows).onConflictDoNothing();
  return rows.length;
}

export async function countObservations(db: Database, importId: string): Promise<number> {
  const rows = await db.select({ id: metricObservations.id }).from(metricObservations).where(eq(metricObservations.importId, importId));
  return rows.length;
}
