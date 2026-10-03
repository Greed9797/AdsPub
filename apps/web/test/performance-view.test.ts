import { describe, expect, it } from 'vitest';

import { descreverPeriodo, maioresGastos, rotuloDaFonte, totalDaTabela } from '../src/lib/performance-view';

const linha = (id: string, spend: number, results = 0) => ({ id, name: `Anúncio ${id}`, spend, results, days: 1, cpa: null });

describe('performance-view (RDS-55)', () => {
  it('o total da tabela soma gasto e resultados', () => {
    expect(totalDaTabela([linha('a', 100, 5), linha('b', 50, 0)])).toEqual({ spend: 150, results: 5 });
    expect(totalDaTabela([])).toEqual({ spend: 0, results: 0 });
  });

  it('descreve o período mesmo sem filtro', () => {
    expect(descreverPeriodo(undefined, undefined)).toBe('todo o histórico');
    expect(descreverPeriodo('2026-09-01', '2026-09-30')).toBe('01/09/2026 a 30/09/2026');
    expect(descreverPeriodo('2026-09-01', undefined)).toBe('a partir de 01/09/2026');
    expect(descreverPeriodo(undefined, '2026-09-30')).toBe('até 30/09/2026');
  });

  it('ignora data fora do formato em vez de mostrar lixo', () => {
    expect(descreverPeriodo('amanhã', '31/12/2026')).toBe('todo o histórico');
  });

  it('nomeia a origem dos dados', () => {
    expect(rotuloDaFonte('file')).toBe('arquivo importado');
    expect(rotuloDaFonte('api')).toBe('API da Meta');
    expect(rotuloDaFonte(undefined)).toBe('todas as fontes');
  });

  it('as barras vão do maior gasto ao menor, relativas ao primeiro, e limitadas', () => {
    const barras = maioresGastos([linha('a', 50), linha('b', 100), linha('c', 25)], 2);
    expect(barras.map((b) => [b.id, b.percentual])).toEqual([['b', 100], ['a', 50]]);
  });

  it('sem gasto nenhum não divide por zero', () => {
    expect(maioresGastos([linha('a', 0)])[0]?.percentual).toBe(0);
  });
});
