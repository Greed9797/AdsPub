import { describe, expect, it } from 'vitest';

import { abaAtiva, abasDoAcesso } from '../src/lib/acesso';

describe('abasDoAcesso (RDS-40, RDS-42)', () => {
  it('mostra Entrar e Primeiro acesso quando o bootstrap está disponível', () => {
    expect(abasDoAcesso(true).map((a) => a.rotulo)).toEqual(['Entrar', 'Primeiro acesso']);
  });

  it('esconde Primeiro acesso quando o bootstrap não está disponível', () => {
    expect(abasDoAcesso(false).map((a) => a.rotulo)).toEqual(['Entrar']);
  });
});

describe('abaAtiva', () => {
  it('abre o primeiro acesso por padrão quando ele existe', () => {
    expect(abaAtiva(true, undefined)).toBe('primeiro');
  });

  it('respeita o pedido de Entrar', () => {
    expect(abaAtiva(true, 'entrar')).toBe('entrar');
  });

  it('ignora o pedido de primeiro acesso quando ele não está disponível', () => {
    expect(abaAtiva(false, 'primeiro')).toBe('entrar');
  });

  it('valor desconhecido cai no padrão', () => {
    expect(abaAtiva(true, 'qualquer')).toBe('primeiro');
    expect(abaAtiva(false, 'qualquer')).toBe('entrar');
  });
});
