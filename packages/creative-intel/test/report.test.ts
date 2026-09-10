import { describe, expect, it } from 'vitest';
import { validateReportOutput, type ReportOutput, type ReportSnapshot } from '../src/report.js';

const snapshot: ReportSnapshot = {
  accountId: 'act1',
  from: '2026-09-01',
  to: '2026-09-02',
  source: 'api',
  totals: { spend: 300, results: 6 },
  rows: [
    { id: 'a1', name: 'A', spend: 100, results: 4, cpa: 25 },
    { id: 'a2', name: 'B', spend: 200, results: 2, cpa: 100 },
  ],
  hasMetrics: true,
  hasMedia: true,
  selectionCoverage: 'all',
  content: [{ assetId: 'asset1', observations: [{ tipo: 'abertura', texto: 'close' }] }],
};

const base: ReportOutput = {
  performance_findings: [{ text: 'A tem menor CPA', metric: 'cpa', value: 25, entity_id: 'a1' }],
  content_observations: ['abertura em close'],
  hypotheses: [
    {
      text: 'close pode esclarecer o benefício',
      support_refs: [{ kind: 'content', ref: 'asset1' }],
      confounders: ['oferta distinta'],
      test: 'variar só a abertura',
    },
  ],
  recommended_tests: [
    { variable: 'abertura', keeps: ['oferta', 'duração'], goal: 'baixar CPA', metric: 'cpa', preconditions: ['ativar fora'] },
  ],
  limitations: ['2 dias de dados'],
};

/** T-007-1: AC-007-01..04 no validador puro. */
describe('validateReportOutput', () => {
  it('saída correta passa', () => {
    expect(validateReportOutput(base, snapshot)).toEqual([]);
  });

  it('número inventado bloqueia', () => {
    const bad = { ...base, performance_findings: [{ text: 'x', metric: 'cpa', value: 10, entity_id: 'a1' }] };
    expect(validateReportOutput(bad, snapshot).join(' ')).toMatch(/lastro/);
  });

  it('referência inexistente bloqueia', () => {
    const bad = {
      ...base,
      hypotheses: [{ ...base.hypotheses[0]!, support_refs: [{ kind: 'content' as const, ref: 'fantasma' }], confounders: [], test: 't' }],
    };
    expect(validateReportOutput(bad, snapshot).join(' ')).toMatch(/inexistente/);
  });

  it('sem métricas não há performance', () => {
    const issues = validateReportOutput(base, { ...snapshot, hasMetrics: false });
    expect(issues.join(' ')).toMatch(/AC-007-01/);
  });

  it('seleção parcial exige viés declarado', () => {
    const issues = validateReportOutput(base, { ...snapshot, selectionCoverage: 'selected' });
    expect(issues.join(' ')).toMatch(/AC-007-04/);
    const ok = validateReportOutput(
      { ...base, limitations: [...base.limitations, 'só vencedores selecionados: sem comparação com ausentes'] },
      { ...snapshot, selectionCoverage: 'selected' },
    );
    expect(ok).toEqual([]);
  });
});
