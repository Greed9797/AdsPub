import { createHash } from 'node:crypto';
import { INSIGHTS_SYNC } from '@adpub/config';
import { detectFatigue, FATIGUE_RULE_VERSION } from '@adpub/analytics';
import {
  createSnapshot,
  dedupAlert,
  getAccount,
  getConnectionRow,
  getSyncState,
  listObservations,
  saveSyncState,
  upsertApiObservations,
} from '@adpub/db';
import { MetaApiError, getInsights } from '@adpub/meta-client';
import type { Alerter } from '../alerts.js';
import type { WorkerContext } from '../context.js';
import type { MetaFactory } from '../meta.js';

export interface InsightsSyncData {
  adAccountId: string;
  since: string;
  until: string;
  backfill?: boolean;
}

export interface InsightsSyncResult {
  snapshot_id: string;
  rows: number;
  completeness: string;
}

const FIELDS = ['ad_id', 'ad_name', 'spend', 'impressions', 'clicks', 'actions', 'action_values'];

/** Chave estável da célula API: mesma consulta sempre mesma linha. */
export function apiRowKey(input: {
  adAccountId: string;
  level: string;
  entityId: string;
  dateStart: string;
  dateStop: string;
  grain: string;
  breakdown: string;
  attribution: string;
}): string {
  return `api:${createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16)}`;
}

function toNumber(raw: string | undefined): number | string | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/**
 * T-004-3: sincroniza Insights no escopo autorizado. Só leitura; nunca muta
 * entrega (AC-004-07). Parcial marca `completude`, nunca "concluído".
 */
export async function runInsightsSync(
  ctx: WorkerContext,
  meta: MetaFactory,
  alert: Alerter,
  data: InsightsSyncData,
): Promise<InsightsSyncResult> {
  const account = await getAccount(ctx.db, data.adAccountId);
  if (!account) throw new Error(`Conta ${data.adAccountId} não existe mais.`);
  if (!account.clientId) throw new Error(`Conta ${data.adAccountId} sem cliente.`);
  const connection = account.connectionId ? await getConnectionRow(ctx.db, account.connectionId) : undefined;
  if (!connection || connection.status !== 'active') {
    throw new Error(`Conexão da conta ${data.adAccountId} sem autorização.`);
  }
  if (account.pausedUntil && account.pausedUntil.getTime() > Date.now()) {
    throw new Error(`Conta ${data.adAccountId} pausada (rate limit).`);
  }

  const level = 'ad';
  const attribution = 'default';
  const breakdown = '';
  const graph = await meta.forAccount(account.id);
  let page;
  try {
    page = await getInsights(graph, account.id, {
      level,
      fields: FIELDS,
      since: data.since,
      until: data.until,
      timeIncrement: 1,
    });
  } catch (error) {
    const state = await getSyncState(ctx.db, account.id);
    await saveSyncState(ctx.db, account.id, { consecutiveFailures: (state?.consecutiveFailures ?? 0) + 1 });
    if (error instanceof MetaApiError && error.isAuth) {
      await meta.handleAuthFailure(connection.id, error.translated.title);
    }
    throw error;
  }

  const snapshot = await createSnapshot(ctx.db, {
    clientId: account.clientId,
    adAccountId: account.id,
    level,
    fields: FIELDS,
    dateStart: data.since,
    dateStop: data.until,
    grain: 'daily',
    attribution,
    breakdownSignature: breakdown,
    completeness: page.complete ? 'complete' : 'partial',
    pages: page.pages,
    sourceParams: { backfill: data.backfill ?? false },
  });

  const rows = page.rows.map((row) => {
    const entityId = row.ad_id ?? row.ad_name ?? '';
    const metrics: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === 'ad_id' || key === 'ad_name' || key === 'date_start' || key === 'date_stop') continue;
      const parsed = toNumber(value);
      if (parsed !== undefined) metrics[key] = parsed;
    }
    return {
      clientId: account.clientId as string,
      adAccountId: account.id,
      importId: null,
      localRowId: apiRowKey({
        adAccountId: account.id,
        level,
        entityId,
        dateStart: row.date_start ?? data.since,
        dateStop: row.date_stop ?? data.until,
        grain: 'daily',
        breakdown,
        attribution,
      }),
      adId: row.ad_id ?? null,
      adName: row.ad_name ?? '',
      entityLevel: level,
      dateStart: row.date_start ?? data.since,
      dateStop: row.date_stop ?? data.until,
      grain: 'daily',
      attribution,
      currency: account.currency,
      breakdownSignature: breakdown,
      metrics,
      snapshotId: snapshot.id,
    };
  });
  await upsertApiObservations(ctx.db, rows);
  await saveSyncState(ctx.db, account.id, {
    lastDailyCovered: data.until,
    consecutiveFailures: 0,
  });
  if (!page.complete) {
    await dedupAlert(ctx.db, alert, {
      rule: 'insights-partial',
      adAccountId: account.id,
      entity: `${data.since}:${data.until}`,
      title: 'Sync parcial de Insights',
      detail: `Conta ${account.id}: teto de páginas, resto fica para o próximo ciclo.`,
      severity: 'warning',
      context: { ad_account_id: account.id, snapshot_id: snapshot.id },
    });
  }
  await checkStaleObjects(ctx, alert, account.id);
  await checkFatigue(ctx, alert, account.id);
  return { snapshot_id: snapshot.id, rows: rows.length, completeness: page.complete ? 'complete' : 'partial' };
}

/** Janela móvel noturna: atribuição + margem, para conversões tardias. */
export function movingWindow(attributionDays: number, today: Date = new Date()): { since: string; until: string } {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (attributionDays + INSIGHTS_SYNC.windowMarginDays) + 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { since: iso(start), until: iso(end) };
}

/** T-009-1: sync de objetos atrasado (>12h) — uma vez por janela. */
async function checkStaleObjects(
  ctx: WorkerContext,
  alert: Alerter,
  adAccountId: string,
): Promise<void> {
  const account = await getAccount(ctx.db, adAccountId);
  const last = account?.lastSyncedAt?.getTime() ?? 0;
  if (Date.now() - last <= 12 * 3600_000) return;
  await dedupAlert(ctx.db, alert, {
    rule: 'sync-stale',
    adAccountId,
    title: 'Sync de objetos atrasado',
    detail: `Conta ${adAccountId} sem sincronizar objetos há mais de 12h.`,
    severity: 'warning',
    context: { ad_account_id: adAccountId },
  });
}

/** T-009-2: fadiga informativa sobre 7d vs 7d anteriores. Nunca muta Meta. */
async function checkFatigue(
  ctx: WorkerContext,
  alert: Alerter,
  adAccountId: string,
): Promise<void> {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const mid = new Date(end);
  mid.setUTCDate(mid.getUTCDate() - 7);
  const start = new Date(mid);
  start.setUTCDate(start.getUTCDate() - 7);
  const rows = await listObservations(ctx.db, {
    adAccountId,
    source: 'api',
    from: iso(start),
    to: iso(end),
  });
  const toPoint = (r: (typeof rows)[number]) => ({
    date: r.dateStart,
    spend: typeof r.metrics.spend === 'number' ? r.metrics.spend : 0,
    results: typeof r.metrics.primary_results === 'number' ? r.metrics.primary_results : null,
    impressions: typeof r.metrics.impressions === 'number' ? r.metrics.impressions : 0,
  });
  const current = rows.filter((r) => r.dateStart > iso(mid)).map(toPoint);
  const previous = rows.filter((r) => r.dateStart <= iso(mid)).map(toPoint);
  const result = detectFatigue(current, previous, {
    version: FATIGUE_RULE_VERSION,
    minSpend: 100,
    minImpressions: 5000,
    cpaRisePct: 30,
  });
  if (!result.fatigued) return;
  await dedupAlert(ctx.db, alert, {
    rule: 'fatigue',
    adAccountId,
    title: 'Possível fadiga de criativos',
    detail: result.reason,
    severity: 'info',
    context: { ad_account_id: adAccountId, current_cpa: result.currentCpa, previous_cpa: result.previousCpa },
  });
}
