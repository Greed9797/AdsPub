import { describe, expect, it } from 'vitest';

import { capacidadesDoPapel, veTodasAsContas } from '../src/lib/papeis';

const pode = (papel: Parameters<typeof capacidadesDoPapel>[0]) => capacidadesDoPapel(papel).map((c) => c.pode);

describe('papeis (RDS-58)', () => {
  it('o administrador pode tudo', () => {
    expect(pode('admin')).toEqual([true, true, true, true]);
  });

  it('o coordenador publica e administra contas, mas não gerencia usuários', () => {
    expect(pode('coordinator')).toEqual([true, true, true, false]);
  });

  it('o gerente publica, mas não vê auditoria nem gerencia usuários', () => {
    expect(pode('manager')).toEqual([true, true, false, false]);
  });

  it('o leitor só consulta', () => {
    expect(pode('viewer')).toEqual([true, false, false, false]);
  });

  it('só admin e coordenador veem todas as contas', () => {
    expect(['admin', 'coordinator', 'manager', 'viewer'].map((p) => veTodasAsContas(p as 'admin'))).toEqual([true, true, false, false]);
  });
});
