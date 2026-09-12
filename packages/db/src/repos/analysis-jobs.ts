import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { analysisJobs } from '../schema.js';
import type { AnalysisJobRow } from '../schema.js';
import type { Database } from '../client.js';

export type { AnalysisJobRow };

/**
 * A9: o job vive no banco, não só no Redis. Redis reinicia; o usuário precisa
 * continuar vendo "na fila", "rodando", "pronto" ou "falhou".
 */

/** Job em aberto do criativo, se houver — pedir de novo não duplica trabalho. */
export async function findActiveAnalysisJob(
  db: Database,
  assetId: string,
): Promise<AnalysisJobRow | undefined> {
  const [row] = await db
    .select()
    .from(analysisJobs)
    .where(and(eq(analysisJobs.assetId, assetId), inArray(analysisJobs.status, ['queued', 'running'])))
    .orderBy(desc(analysisJobs.queuedAt))
    .limit(1);
  return row;
}

export async function createAnalysisJob(
  db: Database,
  input: { assetId: string; brandContext: string; force: boolean; requestedBy: string | null },
): Promise<AnalysisJobRow> {
  const [row] = await db
    .insert(analysisJobs)
    .values({
      assetId: input.assetId,
      brandContext: input.brandContext,
      force: input.force,
      requestedBy: input.requestedBy,
    })
    .returning();
  if (!row) throw new Error('Falha ao criar job de análise.');
  return row;
}

export async function getAnalysisJob(db: Database, id: string): Promise<AnalysisJobRow | undefined> {
  const [row] = await db.select().from(analysisJobs).where(eq(analysisJobs.id, id)).limit(1);
  return row;
}

/** Primeira tentativa marca o início; retentativa não reescreve o histórico. */
export async function markAnalysisJobStarted(db: Database, id: string): Promise<void> {
  await db
    .update(analysisJobs)
    .set({ status: 'running', startedAt: sql`coalesce(${analysisJobs.startedAt}, now())`, updatedAt: new Date() })
    .where(eq(analysisJobs.id, id));
}

export async function finishAnalysisJob(
  db: Database,
  id: string,
  analysisId: string,
): Promise<void> {
  await db
    .update(analysisJobs)
    .set({
      status: 'done',
      analysisId,
      error: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(analysisJobs.id, id));
}

export async function failAnalysisJob(db: Database, id: string, error: string): Promise<void> {
  await db
    .update(analysisJobs)
    .set({
      status: 'failed',
      error: error.slice(0, 500),
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(analysisJobs.id, id));
}

export interface AnalysisJobTimings {
  /** Espera na fila, em ms — separado do tempo de execução. */
  queueWaitMs: number | null;
  /** Execução (ffmpeg + IA + gravação), em ms. */
  runMs: number | null;
}

export function analysisJobTimings(
  job: Pick<AnalysisJobRow, 'queuedAt' | 'startedAt' | 'finishedAt'>,
): AnalysisJobTimings {
  return {
    queueWaitMs: job.startedAt ? job.startedAt.getTime() - job.queuedAt.getTime() : null,
    runMs:
      job.startedAt && job.finishedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null,
  };
}
