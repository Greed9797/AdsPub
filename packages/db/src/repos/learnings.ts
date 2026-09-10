import { desc, eq } from 'drizzle-orm';
import { learnings } from '../schema.js';
import type { Database } from '../client.js';

export type LearningRow = typeof learnings.$inferSelect;

export async function insertLearning(
  db: Database,
  input: typeof learnings.$inferInsert,
): Promise<LearningRow> {
  const [row] = await db.insert(learnings).values(input).returning();
  if (!row) throw new Error('Falha ao gravar aprendizado.');
  return row;
}

export async function getLearning(db: Database, id: string): Promise<LearningRow | undefined> {
  const [row] = await db.select().from(learnings).where(eq(learnings.id, id)).limit(1);
  return row;
}

export async function patchLearning(
  db: Database,
  id: string,
  patch: Partial<Pick<
    LearningRow,
    | 'hypothesis'
    | 'evidenceLevel'
    | 'controlVariantId'
    | 'primaryMetric'
    | 'testConditions'
    | 'testBatchId'
    | 'activatedAt'
    | 'testDesign'
    | 'resultSummary'
    | 'outcome'
  >>,
): Promise<LearningRow | undefined> {
  const [row] = await db
    .update(learnings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(learnings.id, id))
    .returning();
  return row;
}

export async function listLearnings(db: Database, clientId: string): Promise<LearningRow[]> {
  return db
    .select()
    .from(learnings)
    .where(eq(learnings.clientId, clientId))
    .orderBy(desc(learnings.createdAt))
    .limit(200);
}
