import { sql } from 'drizzle-orm';
import { adDrafts, aiGenerations } from '../schema.js';
import type { Database } from '../client.js';

/** T-009-3: números operacionais (filas vêm do BullMQ na rota). */
export async function aiCostTotal(db: Database): Promise<{ totalUsd: number; byPurpose: Record<string, number> }> {
  const rows = await db
    .select({ purpose: aiGenerations.purpose, total: sql<string>`sum(${aiGenerations.costUsd})::text` })
    .from(aiGenerations)
    .groupBy(aiGenerations.purpose);
  const byPurpose: Record<string, number> = {};
  for (const row of rows) byPurpose[row.purpose] = Number(row.total ?? 0);
  return { totalUsd: Object.values(byPurpose).reduce((a, b) => a + b, 0), byPurpose };
}

export async function itemsByStatusGlobal(db: Database): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: adDrafts.status, total: sql<number>`count(*)::int` })
    .from(adDrafts)
    .groupBy(adDrafts.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.total]));
}
