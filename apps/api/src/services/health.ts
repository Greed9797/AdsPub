import {
  countPendingJobs,
  countPublishedToday,
  getConnectionRow,
  listAccountsByIds,
  recentMetaCallStats,
  type AdAccountRow,
} from '@adpub/db';
import { DEFAULT_DAILY_AD_CAP } from '@adpub/config';
import type { ApiDeps } from '../lib/deps.js';

export interface AccountHealth {
  ad_account_id: string;
  name: string;
  connection_status: string;
  rate_usage: AdAccountRow['rateUsage'];
  paused_until: string | null;
  published_today: number;
  daily_cap: number;
  pending_jobs: number;
  error_rate_1h: number;
  p95_latency_ms: number;
}

/** US8: painel de saúde por conta (fila, rate limit, erros, teto diário). */
export async function accountsHealth(
  deps: ApiDeps,
  accountIds: string[],
): Promise<AccountHealth[]> {
  const accounts = await listAccountsByIds(deps.db, accountIds);
  return Promise.all(
    accounts.map(async (account) => {
      const [publishedToday, pendingJobs, stats, connection] = await Promise.all([
        countPublishedToday(deps.db, account.id),
        countPendingJobs(deps.db, account.id),
        recentMetaCallStats(deps.db, account.id),
        account.connectionId
          ? getConnectionRow(deps.db, account.connectionId)
          : Promise.resolve(undefined),
      ]);
      return {
        ad_account_id: account.id,
        name: account.name,
        connection_status: connection?.status ?? 'unknown',
        rate_usage: account.rateUsage,
        paused_until: account.pausedUntil?.toISOString() ?? null,
        published_today: publishedToday,
        daily_cap: account.dailyAdCap ?? DEFAULT_DAILY_AD_CAP,
        pending_jobs: pendingJobs,
        error_rate_1h: stats.errorRate,
        p95_latency_ms: stats.p95LatencyMs,
      };
    }),
  );
}
