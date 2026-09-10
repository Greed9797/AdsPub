import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/csv.js';
import { normalizeHeader, suggestMapping } from '../src/mapping.js';
import { isTotalRow, parseAdId, parseDate, parseDecimal } from '../src/numbers.js';
import { stageRows } from '../src/observation.js';

const enc = (text: string) => new TextEncoder().encode(text);

/** T-003-1: parser determinístico PT/EN, sem chute. */
describe('parseCsv', () => {
  it('fareja ponto-e-vírgula e decimal BR', () => {
    const { headers, rows } = parseCsv(enc('nome;gasto\na;1.234,56\n'));
    expect(headers).toEqual(['nome', 'gasto']);
    expect(rows).toEqual([['a', '1.234,56']]);
  });

  it('lê vírgula, aspas e quebra dentro de aspas', () => {
    const { headers, rows } = parseCsv(enc('"a","b,c"\n"x","y\ny"\n'));
    expect(headers).toEqual(['a', 'b,c']);
    expect(rows).toEqual([['x', 'y\ny']]);
  });

  it('pula linhas vazias e estoura em aspas abertas', () => {
    expect(parseCsv(enc('a\n\nb\n')).rows).toEqual([['b']]);
    expect(() => parseCsv(enc('a\n"b\n'))).toThrow(/Aspas/);
  });
});

describe('escalares', () => {
  it('decimal BR e EN', () => {
    expect(parseDecimal('R$ 1.234,56')).toBe(1234.56);
    expect(parseDecimal('1234.56')).toBe(1234.56);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });

  it('data BR e ISO, sem MM/DD', () => {
    expect(parseDate('31/12/2026')).toBe('2026-12-31');
    expect(parseDate('2026-12-31')).toBe('2026-12-31');
    expect(parseDate('13/13/2026')).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('ID exato ou nada', () => {
    expect(parseAdId('23850000000000903')).toBe('23850000000000903');
    expect(parseAdId('2.385E+14')).toBeNull();
    expect(parseAdId('23850000000000903.0')).toBeNull();
    expect(parseAdId('')).toBeNull();
  });

  it('total detectado', () => {
    expect(isTotalRow('Total da conta')).toBe(true);
    expect(isTotalRow('Anúncio Total Max')).toBe(false);
  });
});

describe('mapeamento', () => {
  it('PT/EN mapeiam, resto fica unmapped, duplicata não rouba', () => {
    const proposal = suggestMapping(['Nome do anúncio', 'Gasto (BRL)', 'Gasto duplicado', 'Coluna X']);
    expect(proposal.mapping['Nome do anúncio']).toBe('ad_name');
    expect(proposal.mapping['Gasto (BRL)']).toBe('spend');
    expect(proposal.mapping['Coluna X']).toBeNull();
    expect(proposal.unmapped).toContain('Coluna X');
    expect(proposal.version).toBe('v1');
  });

  it('normaliza acento e separador', () => {
    expect(normalizeHeader('Impressões')).toBe('impressoes');
    expect(normalizeHeader('Data de início')).toBe('data_de_inicio');
  });
});

describe('stageRows', () => {
  const headers = ['ad_id', 'ad_name', 'date_start', 'date_stop', 'spend', 'impressions'];
  const proposal = {
    mapping: {
      ad_id: 'ad_id',
      ad_name: 'ad_name',
      date_start: 'date_start',
      date_stop: 'date_stop',
      spend: 'spend',
      impressions: 'impressions',
    } as Record<string, 'ad_id' | 'ad_name' | 'date_start' | 'date_stop' | 'spend' | 'impressions'>,
  };

  it('consolidado vira 1 period, vazio é ausente', () => {
    const [row] = stageRows(headers, [['23850000000000903', 'Ad', '01/09/2026', '07/09/2026', '100,50', '']], proposal, 'abc123');
    expect(row?.observation?.grain).toBe('period');
    expect(row?.observation?.metrics.spend).toBe(100.5);
    expect(row?.observation?.metrics.impressions).toBeUndefined();
    expect(row?.observation?.localRowId).toBe('abc123:r1');
  });

  it('total excluído com motivo, ID inexato sem vínculo', () => {
    const [total, inexato] = stageRows(
      headers,
      [
        ['', 'Total da conta', '01/09/2026', '07/09/2026', '10', '5'],
        ['2.385E+14', 'Ad', '01/09/2026', '01/09/2026', '10', '5'],
      ],
      proposal,
      'abc123',
    );
    expect(total?.observation).toBeNull();
    expect(total?.issues.some((i) => i.code === 'row.total')).toBe(true);
    expect(inexato?.observation?.adId).toBeNull();
    expect(inexato?.observation?.grain).toBe('daily');
    expect(inexato?.issues.some((i) => i.code === 'id.inexact')).toBe(true);
  });
});
