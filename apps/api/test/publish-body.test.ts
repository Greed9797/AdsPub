import { describe, expect, it } from 'vitest';
import { publishBody } from '../src/routes/batches.js';

/**
 * T-000-1b (AC-000-02): nenhum pedido ACTIVE passa do contrato. A rota faz
 * `publishBody.parse` antes de qualquer efeito (services/publish só roda
 * depois), então rejeição aqui = zero chamada Meta.
 */
describe('contrato de publicação (Constituição II)', () => {
  it('aceita corpo válido', () => {
    expect(publishBody.parse({ confirm_count: 3 })).toEqual({ only_failed: false, confirm_count: 3 });
  });

  it('rejeita status ACTIVE', () => {
    expect(() =>
      publishBody.parse({ confirm_count: 1, status: 'ACTIVE' }),
    ).toThrow();
  });

  it('rejeita qualquer chave desconhecida', () => {
    expect(() =>
      publishBody.parse({ confirm_count: 1, paused: false }),
    ).toThrow();
  });
});
