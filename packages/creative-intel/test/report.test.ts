import { describe, expect, it } from 'vitest';
import {
  buildReportSnapshot,
  validateReportOutput,
  type ReportOutput,
  type ReportSnapshot,
} from '../src/report.js';

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
describe('buildReportSnapshot', () => {
  const rows = (count: number, texto = 'campanha') =>
    Array.from({ length: count }, (_, index) => ({
      id: `row-${String(index).padStart(3, '0')}`,
      name: `${texto} ${index}`,
      spend: 1000 - index,
      results: 10,
      cpa: 100,
    }));

  const input = (over: Partial<Parameters<typeof buildReportSnapshot>[0]> = {}) => ({
    accountId: 'act1',
    from: '2026-09-01',
    to: '2026-09-30',
    source: 'all',
    totals: { spend: 123_456, results: 789 },
    rows: rows(80),
    content: Array.from({ length: 40 }, (_, index) => ({
      assetId: `asset-${String(index).padStart(3, '0')}`,
      observations: Array.from({ length: 10 }, (_, o) => ({ tipo: 'abertura', texto: `observação ${o} de ${index}` })),
    })),
    selectionCoverage: 'all' as const,
    ...over,
  });

  it('corta antes de serializar e o JSON enviado é sempre parseável', () => {
    const { snapshot, json } = buildReportSnapshot(input());
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json.length).toBeLessThanOrEqual(14_000);
    expect(snapshot.omitted?.rows).toBeGreaterThan(0);
    expect(snapshot.omitted?.contentAssets).toBeGreaterThan(0);
    expect(snapshot.selectionCoverage).toBe('partial');
  });

  it('preserva os totais do período mesmo com linhas cortadas', () => {
    const { snapshot } = buildReportSnapshot(input());
    expect(snapshot.totals).toEqual({ spend: 123_456, results: 789 });
    expect(snapshot.rows.length).toBeLessThan(80);
  });

  it('mantém linhas por gasto e conteúdo por ativo, de forma determinística', () => {
    const first = buildReportSnapshot(input());
    const second = buildReportSnapshot(input());
    expect(first.json).toBe(second.json);
    expect(first.snapshot.rows[0]!.id).toBe('row-000');
    const spends = first.snapshot.rows.map((r) => r.spend);
    expect([...spends].sort((a, b) => b - a)).toEqual(spends);
  });

  it('sem corte, não inventa omissão', () => {
    const { snapshot } = buildReportSnapshot(input({ rows: rows(2), content: [] }));
    expect(snapshot.omitted).toBeNull();
    expect(snapshot.selectionCoverage).toBe('all');
    expect(snapshot.hasMedia).toBe(false);
  });

  it('falha explícita quando nem o menor recorte cabe no orçamento', () => {
    const enorme = Array.from({ length: 6 }, (_, index) => ({
      id: `row-${index}`,
      name: 'x'.repeat(4000),
      spend: 10,
      results: 1,
      cpa: 10,
    }));
    expect(() => buildReportSnapshot(input({ rows: enorme, content: [] }))).toThrow(/orçamento/);
  });
});

describe('validateReportOutput', () => {
  it('achado sobre o total usa os totais, não as linhas listadas', () => {
    const trimmed: ReportSnapshot = {
      ...snapshot,
      rows: [snapshot.rows[0]!],
      selectionCoverage: 'partial',
      omitted: { rows: 1, contentAssets: 0, contentObservations: 0 },
    };
    const total: ReportOutput = {
      ...base,
      performance_findings: [{ text: 'gasto do período', metric: 'spend', value: 300 }],
      limitations: ['amostra parcial: linhas cortadas por orçamento de contexto'],
    };
    expect(validateReportOutput(total, trimmed)).toEqual([]);
    expect(
      validateReportOutput(
        { ...total, performance_findings: [{ text: 'gasto do período', metric: 'spend', value: 100 }] },
        trimmed,
      ).join(' '),
    ).toMatch(/número sem lastro/);
  });

  it('linha cortada não pode ser citada como evidência', () => {
    const trimmed: ReportSnapshot = {
      ...snapshot,
      rows: [snapshot.rows[0]!],
      selectionCoverage: 'partial',
      omitted: { rows: 1, contentAssets: 0, contentObservations: 0 },
    };
    const issues = validateReportOutput(
      {
        ...base,
        hypotheses: [
          {
            text: 'hipótese com a linha cortada',
            support_refs: [{ kind: 'row', ref: 'a2' }],
            confounders: [],
            test: 'teste',
          },
        ],
        limitations: ['seleção parcial por orçamento'],
      },
      trimmed,
    );
    expect(issues.join(' ')).toMatch(/evidência de linha inexistente/);
  });

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
