import { desc, eq } from 'drizzle-orm';
import { analysisReports, reportFeedbacks } from '../schema.js';
import type { Database } from '../client.js';

export type AnalysisReportRow = typeof analysisReports.$inferSelect;

export async function insertReport(
  db: Database,
  input: typeof analysisReports.$inferInsert,
): Promise<AnalysisReportRow> {
  const [row] = await db.insert(analysisReports).values(input).returning();
  if (!row) throw new Error('Falha ao gravar relatório.');
  return row;
}

export async function getReport(db: Database, id: string): Promise<AnalysisReportRow | undefined> {
  const [row] = await db.select().from(analysisReports).where(eq(analysisReports.id, id)).limit(1);
  return row;
}

export async function addFeedback(
  db: Database,
  reportId: string,
  actorId: string | null,
  text: string,
): Promise<void> {
  await db.insert(reportFeedbacks).values({ reportId, actorId, text });
}

export async function listFeedbacks(db: Database, reportId: string) {
  return db
    .select()
    .from(reportFeedbacks)
    .where(eq(reportFeedbacks.reportId, reportId))
    .orderBy(desc(reportFeedbacks.createdAt))
    .limit(100);
}
