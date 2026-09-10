import { describe, expect, it } from 'vitest';
import { MetaApiError } from '../src/errors.js';
import {
  fetchInsightsResult,
  getInsights,
  getInsightsJob,
  startInsightsJob,
} from '../src/read/insights.js';
import { fixture, makeClient } from './helpers.js';

const query = {
  level: 'ad' as const,
  fields: ['ad_id', 'ad_name', 'spend', 'impressions'],
  since: '2026-09-01',
  until: '2026-09-01',
};

/** T-004-1: Insights pagina tudo ou marca parcial; erro inválido diagnostica. */
describe('getInsights', () => {
  it('importa todas as páginas', async () => {
    const fetchImpl = (async (input: unknown) => {
      const url = String(input);
      const json = url.includes('after=') ? fixture('insights_page2') : fixture('insights_page1');
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const stub = { fetchImpl, calls: [], logs: [] } as never;
    const page = await getInsights(makeClient(stub), '1030000000001', query);
    expect(page.rows).toHaveLength(3);
    expect(page.pages).toBe(2);
    expect(page.complete).toBe(true);
    expect(page.rows[0]?.spend).toBe('100.50');
  });

  it('teto de páginas marca parcial, nunca concluído', async () => {
    const fetchImpl = (async () => {
      return new Response(JSON.stringify(fixture('insights_page1')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const stub = { fetchImpl, calls: [], logs: [] } as never;
    const page = await getInsights(makeClient(stub), '1030000000001', { ...query, maxPages: 1 });
    expect(page.complete).toBe(false);
    expect(page.rows).toHaveLength(2);
  });

  it('campo inválido vira erro permanente com diagnóstico', async () => {
    const fetchImpl = (async () => {
      return new Response(JSON.stringify(fixture('insights_error')), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const stub = { fetchImpl, calls: [], logs: [] } as never;
    const error = await getInsights(makeClient(stub), '1030000000001', query).catch((e) => e);
    expect(error).toBeInstanceOf(MetaApiError);
    expect((error as MetaApiError).isTransient).toBe(false);
  });
});

describe('insights assíncrono', () => {
  it('cria job, lê estado e baixa resultado', async () => {
    const fetchImpl = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      let json: unknown = fixture('insights_page2');
      if (method === 'POST') json = fixture('insights_job');
      else if (url.includes('1234567890/insights')) json = fixture('insights_page2');
      else if (url.includes('1234567890')) json = fixture('insights_job_status');
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const stub = { fetchImpl, calls: [], logs: [] } as never;
    const client = makeClient(stub);
    const job = await startInsightsJob(client, '1030000000001', query);
    expect(job.reportRunId).toBe('1234567890');
    const status = await getInsightsJob(client, job.reportRunId);
    expect(status.status).toBe('complete');
    const result = await fetchInsightsResult(client, job.reportRunId);
    expect(result.rows).toHaveLength(1);
    expect(result.complete).toBe(true);
  });
});
