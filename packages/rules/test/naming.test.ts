import { describe, expect, it } from 'vitest';
import {
  matchesNamingTemplate,
  namingTemplateRegex,
  renderNamingTemplate,
  slugToken,
} from '../src/naming.js';

const TEMPLATE = '{cliente}_{objetivo}_{data:YYYYMMDD}_{criativo}_{formato}_{v}';

describe('renderNamingTemplate', () => {
  it('renderiza todos os tokens', () => {
    const name = renderNamingTemplate(TEMPLATE, {
      cliente: 'Loja Teste',
      objetivo: 'OUTCOME_SALES',
      criativo: 'Inverno 01',
      formato: 'single_image',
      v: 2,
      data: new Date('2026-09-08T12:00:00Z'),
    });
    expect(name).toBe('loja-teste_outcome-sales_20260908_inverno-01_single-image_2');
  });

  it('remove acento e normaliza separadores', () => {
    expect(slugToken('Promoção de Inverno!')).toBe('promocao-de-inverno');
  });

  it('colapsa separadores quando um token está vazio', () => {
    const name = renderNamingTemplate('{cliente}_{objetivo}_{v}', { cliente: 'X', v: 1 });
    expect(name).toBe('x_1');
  });

  it('suporta formatos alternativos de data', () => {
    const d = new Date('2026-01-05T00:00:00Z');
    expect(renderNamingTemplate('{data:YYYY-MM-DD}', { data: d })).toBe('2026-01-05');
    expect(renderNamingTemplate('{data:DDMMYYYY}', { data: d })).toBe('05012026');
  });
});

describe('matchesNamingTemplate', () => {
  it('aceita nome gerado pelo próprio template', () => {
    const name = renderNamingTemplate(TEMPLATE, {
      cliente: 'Loja',
      objetivo: 'vendas',
      criativo: 'c1',
      formato: 'single_image',
      v: 1,
      data: new Date('2026-09-08T00:00:00Z'),
    });
    expect(matchesNamingTemplate(name, TEMPLATE)).toBe(true);
  });

  it('recusa nome fora do padrão', () => {
    expect(matchesNamingTemplate('teste manual 1', TEMPLATE)).toBe(false);
    expect(matchesNamingTemplate('loja_vendas_2026_c1_single-image_1', TEMPLATE)).toBe(false);
  });

  it('exige {v} numérico', () => {
    expect(matchesNamingTemplate('loja_vendas_20260908_c1_single-image_a', TEMPLATE)).toBe(false);
  });

  it('gera regex ancorada', () => {
    const re = namingTemplateRegex('{cliente}_{v}');
    expect(re.source.startsWith('^')).toBe(true);
    expect(re.source.endsWith('$')).toBe(true);
  });
});
