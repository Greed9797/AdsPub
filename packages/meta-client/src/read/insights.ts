import type { MetaClient } from '../client.js';
import { MetaApiError } from '../errors.js';

/**
 * T-004-1: leitura de Insights (síncrona e assíncrona). Consulta é explícita
 * em nível, campos, janela, atribuição e breakdowns — combinação inválida
 * volta como erro permanente com diagnóstico, nunca zero (AC-004-06).
 */
export interface InsightsQuery {
  level: 'account' | 'campaign' | 'adset' | 'ad';
  fields: string[];
  since: string;
  until: string;
  timeIncrement?: number | 'all_days';
  breakdowns?: string[];
  actionReportTime?: string;
  limit?: number;
  maxPages?: number;
}

export type InsightRow = Record<string, string>;

export interface InsightsPage {
  rows: InsightRow[];
  pages: number;
  /** `false` quando o teto de páginas estourou com mais por ler (nunca "concluído"). */
  complete: boolean;
}

interface PagedInsights {
  data?: Array<Record<string, unknown>>;
  paging?: { cursors?: { after?: string }; next?: string };
}

const DEFAULT_MAX_PAGES = 20;

function baseParams(query: InsightsQuery): Record<string, string | number> {
  return {
    fields: query.fields.join(','),
    level: query.level,
    time_range: JSON.stringify({ since: query.since, until: query.until }),
    time_increment: query.timeIncrement ?? 1,
    ...(query.breakdowns?.length ? { breakdowns: query.breakdowns.join(',') } : {}),
    ...(query.actionReportTime ? { action_report_time: query.actionReportTime } : {}),
  };
}

function toRow(raw: Record<string, unknown>): InsightRow {
  const row: InsightRow = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    row[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  return row;
}

/** Síncrono: pagina até esgotar ou o teto; `complete=false` se faltou página. */
export async function getInsights(
  client: MetaClient,
  adAccountId: string,
  query: InsightsQuery,
): Promise<InsightsPage> {
  const maxPages = query.maxPages ?? DEFAULT_MAX_PAGES;
  const rows: InsightRow[] = [];
  let after: string | undefined;
  let pages = 0;
  let complete = true;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.get<PagedInsights>(`act_${adAccountId}/insights`, {
      limit: query.limit ?? 100,
      ...baseParams(query),
      ...(after ? { after } : {}),
    });
    pages += 1;
    for (const item of response.data ?? []) rows.push(toRow(item));
    after = response.paging?.cursors?.after;
    if (!after || !response.paging?.next) break;
    if (page === maxPages - 1) complete = false;
  }
  return { rows, pages, complete };
}

export interface InsightsJob {
  reportRunId: string;
}

/** Assíncrono: cria o `AdReportRun` (leitura analítica, mesmo via POST). */
export async function startInsightsJob(
  client: MetaClient,
  adAccountId: string,
  query: InsightsQuery,
): Promise<InsightsJob> {
  const response = await client.post<{ report_run_id: string }>(`act_${adAccountId}/insights`, {
    ...baseParams(query),
    limit: query.limit ?? 100,
  });
  if (!response.report_run_id) throw new MetaApiError({ httpStatus: 200, endpoint: 'insights', method: 'POST', body: { message: 'Resposta sem report_run_id.' } });
  return { reportRunId: response.report_run_id };
}

export interface InsightsJobStatus {
  status: 'complete' | 'running' | 'failed';
  percent: number;
}

export async function getInsightsJob(client: MetaClient, reportRunId: string): Promise<InsightsJobStatus> {
  const response = await client.get<{ async_status: string; async_percent_completion?: number }>(reportRunId, {
    fields: 'async_status,async_percent_completion',
  });
  const raw = (response.async_status ?? '').toLowerCase();
  if (raw.includes('complete')) return { status: 'complete', percent: 100 };
  if (raw.includes('fail')) return { status: 'failed', percent: response.async_percent_completion ?? 0 };
  return { status: 'running', percent: response.async_percent_completion ?? 0 };
}

/** Baixa o resultado do job pronto, paginando igual ao síncrono. */
export async function fetchInsightsResult(
  client: MetaClient,
  reportRunId: string,
  maxPages = DEFAULT_MAX_PAGES,
): Promise<InsightsPage> {
  const rows: InsightRow[] = [];
  let after: string | undefined;
  let pages = 0;
  let complete = true;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.get<PagedInsights>(`${reportRunId}/insights`, {
      limit: 100,
      ...(after ? { after } : {}),
    });
    pages += 1;
    for (const item of response.data ?? []) rows.push(toRow(item));
    after = response.paging?.cursors?.after;
    if (!after || !response.paging?.next) break;
    if (page === maxPages - 1) complete = false;
  }
  return { rows, pages, complete };
}
