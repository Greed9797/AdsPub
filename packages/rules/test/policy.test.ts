import { describe, expect, it } from 'vitest';
import { capsRatio, checkPolicy } from '../src/policy.js';

const categories = (text: string, forbidden: string[] = []) =>
  checkPolicy(text, { forbiddenTerms: forbidden }).map((i) => i.category);

describe('checkPolicy', () => {
  it('não acusa copy limpa', () => {
    expect(checkPolicy('Coleção de inverno com 20% OFF até sexta. Aproveite.')).toEqual([]);
  });

  it('detecta atributo pessoal', () => {
    expect(categories('Você tem dificuldade para dormir? Temos a solução.')).toContain(
      'atributo_pessoal',
    );
  });

  it('detecta antes e depois', () => {
    expect(categories('Veja o antes e depois dos nossos clientes')).toContain('antes_e_depois');
  });

  it('detecta promessa de resultado', () => {
    expect(categories('Resultados garantidos em 7 dias')).toContain('promessa_de_resultado');
    expect(categories('Perca 10 kg com o método')).toContain('promessa_de_resultado');
  });

  it('detecta caixa alta acima de 30%', () => {
    expect(categories('COMPRE AGORA MESMO essa oferta')).toContain('caixa_alta');
  });

  it('ignora caixa alta em texto curto', () => {
    expect(categories('OFERTA')).not.toContain('caixa_alta');
  });

  it('detecta pontuação excessiva como info', () => {
    const issues = checkPolicy('Corre que acaba hoje!!!');
    expect(issues.map((i) => i.category)).toContain('pontuacao_excessiva');
    expect(issues.find((i) => i.category === 'pontuacao_excessiva')?.severity).toBe('info');
  });

  it('marca termo proibido do cliente como erro', () => {
    const issues = checkPolicy('O produto mais barato da cidade', { forbiddenTerms: ['barato'] });
    const forbidden = issues.find((i) => i.category === 'termo_proibido');
    expect(forbidden?.severity).toBe('error');
    expect(forbidden?.excerpt).toBe('barato');
  });

  it('não confunde termo proibido dentro de outra palavra', () => {
    expect(categories('Baratinho não é o caso', ['barato'])).not.toContain('termo_proibido');
  });

  it('não duplica o mesmo achado', () => {
    const issues = checkPolicy('Antes e depois. Antes e depois.');
    expect(issues.filter((i) => i.category === 'antes_e_depois')).toHaveLength(1);
  });

  it('traz o trecho encontrado', () => {
    const issue = checkPolicy('Você é ansioso e quer mudar?')[0];
    expect(issue?.excerpt.toLowerCase()).toContain('você é ansioso');
    expect(issue?.source).toBe('rules');
  });
});

describe('capsRatio', () => {
  it('ignora pontuação e números', () => {
    expect(capsRatio('ABC 123!!!')).toBe(1);
    expect(capsRatio('abc')).toBe(0);
    expect(capsRatio('123')).toBe(0);
  });
});
