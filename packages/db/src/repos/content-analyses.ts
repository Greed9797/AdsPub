import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { assets, contentAnalyses } from '../schema.js';
import type { ContentAnalysisLike } from '../schema.js';
import type { Database } from '../client.js';

export type ContentAnalysisRow = typeof contentAnalyses.$inferSelect;

export async function getAnalysisById(db: Database, id: string): Promise<ContentAnalysisRow | undefined> {
  const [row] = await db.select().from(contentAnalyses).where(eq(contentAnalyses.id, id)).limit(1);
  return row;
}

export async function findAnalysisByInput(  db: Database,
  assetId: string,
  inputHash: string,
): Promise<ContentAnalysisRow | undefined> {
  const [row] = await db
    .select()
    .from(contentAnalyses)
    .where(and(eq(contentAnalyses.assetId, assetId), eq(contentAnalyses.inputHash, inputHash)))
    .limit(1);
  return row;
}

export async function insertAnalysis(
  db: Database,
  input: typeof contentAnalyses.$inferInsert,
): Promise<ContentAnalysisRow> {
  const [row] = await db.insert(contentAnalyses).values(input).returning();
  if (!row) throw new Error('Falha ao gravar análise.');
  return row;
}

export async function supersedeAnalysis(db: Database, id: string, supersededBy: string): Promise<void> {
  await db.update(contentAnalyses).set({ supersededBy }).where(eq(contentAnalyses.id, id));
}

export async function listAnalyses(db: Database, assetId: string): Promise<ContentAnalysisRow[]> {
  return db
    .select()
    .from(contentAnalyses)
    .where(eq(contentAnalyses.assetId, assetId))
    .orderBy(desc(contentAnalyses.revision))
    .limit(20);
}

/**
 * Análises atuais dos criativos de um cliente numa consulta só: o relatório
 * fazia uma consulta por ativo e lia até 50.
 */
export async function listCurrentAnalysesForClient(
  db: Database,
  clientId: string,
): Promise<Array<{ assetId: string; findings: ContentAnalysisLike }>> {
  return db
    .select({ assetId: contentAnalyses.assetId, findings: contentAnalyses.findings })
    .from(contentAnalyses)
    .innerJoin(assets, eq(assets.id, contentAnalyses.assetId))
    .where(and(eq(assets.clientId, clientId), isNull(contentAnalyses.supersededBy)))
    .orderBy(asc(contentAnalyses.assetId));
}
