import { describe, expect, it } from 'vitest';

import { ladosDaAlteracao, temAlteracao } from '../src/lib/auditoria-view';

describe('auditoria-view (RDS-57)', () => {
  it('devolve o antes e o depois, nessa ordem, formatados', () => {
    const lados = ladosDaAlteracao({ before: { nome: 'A' }, after: { nome: 'B' } });
    expect(lados.map((l) => l.rotulo)).toEqual(['Antes', 'Depois']);
    expect(lados[0]!.texto).toBe('{\n  "nome": "A"\n}');
    expect(lados[1]!.texto).toContain('"B"');
  });

  it('um evento de criação não tem antes', () => {
    const [antes, depois] = ladosDaAlteracao({ before: null, after: { id: 1 } });
    expect(antes!.texto).toBeNull();
    expect(depois!.texto).not.toBeNull();
  });

  it('valor falso mas presente (0, string vazia) continua sendo mostrado', () => {
    expect(ladosDaAlteracao({ before: 0, after: '' }).map((l) => l.texto)).toEqual(['0', '""']);
  });

  it('sem nenhum dos lados não há o que expandir', () => {
    expect(temAlteracao({ before: undefined, after: null })).toBe(false);
    expect(temAlteracao({ before: undefined, after: { a: 1 } })).toBe(true);
  });
});
