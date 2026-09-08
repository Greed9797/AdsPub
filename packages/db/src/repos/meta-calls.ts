import { and, eq, sql } from 'drizzle-orm';
import { metaApiCalls } from '../schema.js';
import type { Database } from '../client.js';

export interface MetaCallRecord {
  adAccountId?: string | null;
  adDraftId?: string | null;
  method: string;
  endpoint: string;
  apiVersion: string;
  statusCode: number;
  errorCode?: number | null;
  errorSubcode?: number | null;
  latencyMs: number;
  usage?: Record<string, unknown>;
}

/** Constituição VI: toda chamada registrada com versão, latência e uso. */
export async function recordMetaCall(db: Database, call: MetaCallRecord): Promise<void> {
  await db.insert(metaApiCalls).values({
    adAccountId: call.adAccountId ?? null,
    adDraftId: call.adDraftId ?? null,
    method: call.method,
    endpoint: call.endpoint,
    apiVersion: call.apiVersion,
    statusCode: call.statusCode,
    errorCode: call.errorCode ?? null,
    errorSubcode: call.errorSubcode ?? null,
    latencyMs: call.latencyMs,
    usage: call.usage ?? {},
  });
}

export async function countErrorsLast24h(db: Database, adAccountId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(metaApiCalls)
    .where(
      and(
        eq(metaApiCalls.adAccountId, adAccountId),
        sql`${metaApiCalls.statusCode} >= 400`,
        sql`${metaApiCalls.createdAt} > now() - interval '24 hours'`,
      ),
    );
  return row?.total ?? 0;
}

export async function purgeOldMetaCalls(db: Database, days = 90): Promise<void> {
  await db
    .delete(metaApiCalls)
    .where(sql`${metaApiCalls.createdAt} < now() - ${sql.raw(`interval '${Math.trunc(days)} days'`)}`);
}

export interface MetaCallStats {
  calls: number;
  errors: number;
  errorRate: number;
  p95LatencyMs: number;
}

/** US8: métricas da última hora por conta, para o painel de saúde. */
export async function recentMetaCallStats(
  db: Database,
  adAccountId: string,
  windowMinutes = 60,
): Promise<MetaCallStats> {
  const [row] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${metaApiCalls.statusCode} >= 400)::int`,
      p95: sql<number>`coalesce(percentile_disc(0.95) within group (order by ${metaApiCalls.latencyMs}), 0)::int`,
    })
    .from(metaApiCalls)
    .where(
      and(
        eq(metaApiCalls.adAccountId, adAccountId),
        sql`${metaApiCalls.createdAt} >= now() - make_interval(mins => ${windowMinutes})`,
      ),
    );
  const calls = row?.calls ?? 0;
  const errors = row?.errors ?? 0;
  return {
    calls,
    errors,
    errorRate: calls === 0 ? 0 : Number((errors / calls).toFixed(4)),
    p95LatencyMs: row?.p95 ?? 0,
  };
}
