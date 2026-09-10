import { getAccount, getClient, listObservations } from '@adpub/db';
import { METRIC_VERSION, checkCohort, computeTotals, evaluateVerdict } from '@adpub/analytics';
import { notFound } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

export interface PerformanceQuery {
  adAccountId: string;
  from?: string;
  to?: string;
  source?: 'file' | 'api';
  level?: string;
}

/** T-005-3: números auditáveis antes de qualquer IA. Sem denominador, sem número. */
export async function getPerformance(deps: ApiDeps, query: PerformanceQuery) {
  const account = await getAccount(deps.db, query.adAccountId);
  if (!account) throw notFound(`Conta ${query.adAccountId} não encontrada.`);
  const client = account.clientId ? await getClient(deps.db, account.clientId) : undefined;

  const observations = (
    await listObservations(deps.db, {
      adAccountId: query.adAccountId,
      ...(query.source ? { source: query.source } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    })
  ).filter((o) => !query.level || o.entityLevel === query.level);

  const num = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const str = (value: unknown): string => (typeof value === 'string' ? value : 'unknown');

  const rows = observations.map((o) => ({
    id: (o.adId ?? o.localRowId) as string,
    adId: o.adId,
    adName: o.adName,
    snapshotId: o.snapshotId,
    observedAt: o.observedAt?.toISOString() ?? null,
    dateStart: o.dateStart,
    spend: num(o.metrics.spend),
    impressions: num(o.metrics.impressions),
    linkClicks: num(o.metrics.link_clicks),
    outboundClicks: num(o.metrics.outbound_clicks),
    primaryResults: num(o.metrics.primary_results),
    primaryResultValue: num(o.metrics.primary_result_value),
    currency: o.currency,
    attribution: o.attribution,
    primaryEvent: str(o.metrics.primary_event_type),
  }));

  const cohort = checkCohort(
    rows.map((r) => ({
      id: r.id,
      accountId: query.adAccountId,
      currency: r.currency,
      attribution: r.attribution,
      primaryEvent: r.primaryEvent,
    })),
  );

  const totals = computeTotals(rows);
  const byEntity = new Map<string, { spend: number; results: number; days: Set<string>; name: string }>();
  for (const r of rows) {
    const key = r.adId ?? r.id;
    const entry = byEntity.get(key) ?? { spend: 0, results: 0, days: new Set<string>(), name: r.adName };
    entry.spend += r.spend ?? 0;
    entry.results += r.primaryResults ?? 0;
    entry.days.add(r.dateStart);
    byEntity.set(key, entry);
  }
  const ranking = [...byEntity.entries()]
    .map(([id, e]) => ({
      id,
      name: e.name,
      spend: e.spend,
      results: e.results,
      days: e.days.size,
      cpa: e.results > 0 ? e.spend / e.results : null,
    }))
    .sort((a, b) => (a.cpa ?? Number.POSITIVE_INFINITY) - (b.cpa ?? Number.POSITIVE_INFINITY));

  const policy = (client?.metricPolicy ?? null) as {
    version: string;
    minSpend: number;
    minResults: number;
    minDays: number;
    maturityDays: number;
  } | null;
  const verdict = evaluateVerdict(
    ranking.map((r) => ({ id: r.id, spend: r.spend, results: r.results, daysActive: r.days })),
    policy,
  );

  const snapshots = [...new Set(rows.map((r) => r.snapshotId).filter(Boolean))];
  const observedAt = rows.map((r) => r.observedAt).filter(Boolean).sort();
  return {
    ad_account_id: query.adAccountId,
    metric_version: METRIC_VERSION,
    totals,
    rows: ranking,
    cohort,
    verdict,
    sources: {
      filter: query.source ?? 'all',
      snapshots,
      observed_at_max: observedAt[observedAt.length - 1] ?? null,
      observations: observations.length,
    },
    definitions: {
      cpa: 'soma(spend)/soma(primary_results)',
      roas: 'soma(primary_result_value)/soma(spend)',
      note: 'Ausência de dado é indisponível com motivo, nunca zero.',
    },
  };
}
