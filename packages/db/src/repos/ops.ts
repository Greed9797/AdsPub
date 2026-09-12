import { sql } from 'drizzle-orm';
import { adDrafts, aiUsage } from '../schema.js';
import type { Database } from '../client.js';

export interface AiCostSummary {
  totalUsd: number;
  byPurpose: Record<string, number>;
  byStatus: Record<string, number>;
  attempts: number;
  failedAttempts: number;
}

/**
 * T-009-3/A11: custo de IA lido de `ai_usage` — uma linha por tentativa que
 * chegou ao provedor, inclusive as que foram recusadas na validação depois.
 * `ai_generations` guarda o resultado reutilizável, não a conta, então não
 * serve mais como fonte de custo.
 */
export async function aiCostTotal(db: Database): Promise<AiCostSummary> {
  const rows = await db
    .select({
      purpose: aiUsage.purpose,
      total: sql<string>`sum(${aiUsage.costUsd})::text`,
      attempts: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${aiUsage.status} <> 'ok')::int`,
    })
    .from(aiUsage)
    .groupBy(aiUsage.purpose);
  const byPurpose: Record<string, number> = {};
  let totalUsd = 0;
  let attempts = 0;
  let failedAttempts = 0;
  for (const row of rows) {
    const total = Number(row.total ?? 0);
    byPurpose[row.purpose] = total;
    totalUsd += total;
    attempts += row.attempts;
    failedAttempts += row.failed;
  }
  const statusRows = await db
    .select({ status: aiUsage.status, total: sql<string>`sum(${aiUsage.costUsd})::text` })
    .from(aiUsage)
    .groupBy(aiUsage.status);
  const byStatus: Record<string, number> = {};
  for (const row of statusRows) byStatus[row.status] = Number(row.total ?? 0);
  return { totalUsd, byPurpose, byStatus, attempts, failedAttempts };
}

export async function itemsByStatusGlobal(db: Database): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: adDrafts.status, total: sql<number>`count(*)::int` })
    .from(adDrafts)
    .groupBy(adDrafts.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.total]));
}
