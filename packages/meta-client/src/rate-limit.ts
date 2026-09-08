import { CONCURRENCY_BY_TIER, RATE_LIMIT_THROTTLE_PERCENT } from '@adpub/config';
import type { ApiTier } from '@adpub/shared';

/** R6: leitura de `X-Business-Use-Case-Usage` / `X-Ad-Account-Usage` / `X-App-Usage`. */

export interface UsageBucket {
  type?: string;
  call_count?: number;
  total_cputime?: number;
  total_time?: number;
  estimated_time_to_regain_access?: number;
  ads_api_access_tier?: string;
}

export interface RateUsage {
  maxPercent: number;
  estimatedTimeToRegainAccessMs: number;
  tier: ApiTier;
  raw: Record<string, unknown>;
}

function percentOf(bucket: UsageBucket): number {
  return Math.max(bucket.call_count ?? 0, bucket.total_cputime ?? 0, bucket.total_time ?? 0);
}

function parseJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function parseUsageHeaders(headers: Headers): RateUsage {
  const raw: Record<string, unknown> = {};
  let maxPercent = 0;
  let regainMinutes = 0;
  let tier: ApiTier = 'unknown';

  const businessUsage = parseJson(headers.get('x-business-use-case-usage'));
  if (businessUsage && typeof businessUsage === 'object') {
    raw['x-business-use-case-usage'] = businessUsage;
    for (const buckets of Object.values(businessUsage as Record<string, UsageBucket[]>)) {
      for (const bucket of buckets ?? []) {
        maxPercent = Math.max(maxPercent, percentOf(bucket));
        regainMinutes = Math.max(regainMinutes, bucket.estimated_time_to_regain_access ?? 0);
        const bucketTier = bucket.ads_api_access_tier?.toLowerCase() ?? '';
        if (bucketTier.includes('standard') || bucketTier.includes('full')) tier = 'full';
        else if (bucketTier.includes('development') || bucketTier.includes('limited')) tier = 'limited';
      }
    }
  }

  const appUsage = parseJson(headers.get('x-app-usage')) as UsageBucket | undefined;
  if (appUsage) {
    raw['x-app-usage'] = appUsage;
    maxPercent = Math.max(maxPercent, percentOf(appUsage));
  }

  const accountUsage = parseJson(headers.get('x-ad-account-usage')) as
    | { acc_id_util_pct?: number; ads_api_access_tier?: string }
    | undefined;
  if (accountUsage) {
    raw['x-ad-account-usage'] = accountUsage;
    maxPercent = Math.max(maxPercent, accountUsage.acc_id_util_pct ?? 0);
    const accTier = accountUsage.ads_api_access_tier?.toLowerCase() ?? '';
    if (accTier.includes('standard') || accTier.includes('full')) tier = 'full';
    else if (accTier.includes('development') || accTier.includes('limited')) tier = 'limited';
  }

  return {
    maxPercent,
    estimatedTimeToRegainAccessMs: regainMinutes * 60_000,
    tier,
    raw,
  };
}

/** Concorrência da conta: cai para 1 a partir de 75 % de uso. */
export function decideConcurrency(usage: Pick<RateUsage, 'maxPercent'>, tier: ApiTier): number {
  const base = tier === 'full' ? CONCURRENCY_BY_TIER.full : CONCURRENCY_BY_TIER.limited;
  return usage.maxPercent >= RATE_LIMIT_THROTTLE_PERCENT ? 1 : base;
}

export function shouldThrottle(usage: Pick<RateUsage, 'maxPercent'>): boolean {
  return usage.maxPercent >= RATE_LIMIT_THROTTLE_PERCENT;
}

/** Quanto tempo pausar a fila da conta após erro de rate limit. */
export function pauseDurationMs(
  estimatedMs: number | undefined,
  attempt: number,
  fallbackBaseMs = 60_000,
): number {
  if (estimatedMs && estimatedMs > 0) return estimatedMs;
  return Math.min(fallbackBaseMs * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
}
