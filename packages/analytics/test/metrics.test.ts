import { describe, expect, it } from 'vitest';
import { aggregateReach, computeTotals } from '../src/metrics.js';
import { checkCohort, evaluateVerdict } from '../src/groups.js';

/** T-005-1/2: AC-005-01..06 no motor puro. */
describe('computeTotals', () => {
  it('ROAS é total/total, nunca média de linhas', () => {
    const totals = computeTotals([
      { id: 'a', spend: 100, impressions: 1000, linkClicks: 10, primaryResults: 1, primaryResultValue: 500 },
      { id: 'b', spend: 100, impressions: 1000, linkClicks: 10, primaryResults: 3, primaryResultValue: 300 },
    ]);
    expect(totals.roas.value).toBe(800 / 200);
    expect(totals.cpa.value).toBe(200 / 4);
    expect(totals.cpm.value).toBe(100);
  });

  it('gasto sem compras = sem CPA, nunca zero', () => {
    const totals = computeTotals([{ id: 'a', spend: 50, impressions: 100 }]);
    expect(totals.results).toBeNull();
    expect(totals.cpa).toEqual({ value: null, reason: 'sem resultados do evento no período' });
    const zero = computeTotals([{ id: 'a', spend: 50, impressions: 100, primaryResults: 0 }]);
    expect(zero.cpa).toEqual({ value: null, reason: 'sem compras no período' });
  });

  it('alcance não soma', () => {
    expect(aggregateReach([100, 200])).toEqual({
      value: null,
      reason: 'alcance diário não soma: sem recorte agregado do período',
    });
  });
});

describe('coorte e veredicto', () => {
  const row = { id: 'a', accountId: 'act1', currency: 'BRL', attribution: '7d', primaryEvent: 'Purchase' };

  it('misturar moeda/evento bloqueia ranking com limitação', () => {
    expect(checkCohort([row]).comparable).toBe(true);
    const mixed = checkCohort([row, { ...row, id: 'b', currency: 'USD' }]);
    expect(mixed.comparable).toBe(false);
    expect(mixed.limitations.join(' ')).toMatch(/moedas/);
  });

  it('sem política não há veredicto', () => {
    expect(evaluateVerdict([{ id: 'a', spend: 100, results: 5, daysActive: 7 }]).sufficiency).toBe('unevaluated');
  });

  it('com política o vencedor é o menor CPA elegível', () => {
    const verdict = evaluateVerdict(
      [
        { id: 'a', spend: 100, results: 10, daysActive: 7 },
        { id: 'b', spend: 100, results: 5, daysActive: 7 },
        { id: 'c', spend: 1, results: 1, daysActive: 7 },
      ],
      { version: 'v1', minSpend: 10, minResults: 2, minDays: 3, maturityDays: 7 },
    );
    expect(verdict).toMatchObject({ sufficiency: 'evaluated', winnerId: 'a' });
  });
});

describe('detectFatigue', () => {
  it('sobe com CPA em alta e volume', async () => {
    const { detectFatigue } = await import('../src/fatigue.js');
    const days = (spend: number, results: number | null): Array<{ date: string; spend: number; results: number | null; impressions: number }> =>
      Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-0${i + 1}`, spend: spend / 7, results: results === null ? null : results / 7, impressions: 1000 }));
    const result = detectFatigue(days(700, 7), days(350, 7), {
      version: 'fatigue.v1',
      minSpend: 100,
      minImpressions: 1000,
      cpaRisePct: 20,
    });
    expect(result.fatigued).toBe(true);
    expect(result.confounders.length).toBeGreaterThan(0);
  });

  it('sem volume não alerta', async () => {
    const { detectFatigue } = await import('../src/fatigue.js');
    const result = detectFatigue(
      [{ date: '2026-09-01', spend: 1, results: 0, impressions: 10 }],
      [{ date: '2026-08-25', spend: 1, results: 1, impressions: 10 }],
      { version: 'fatigue.v1', minSpend: 100, minImpressions: 1000, cpaRisePct: 20 },
    );
    expect(result.fatigued).toBe(false);
    expect(result.reason).toMatch(/amostra/);
  });
});
