import { describe, expect, it } from 'vitest';

import { revisaoFinal } from '../src/lib/publicacao';

describe('revisaoFinal (RDS-24)', () => {
  it('tudo entra quando o lote cabe no saldo', () => {
    expect(revisaoFinal(5, 5)).toEqual({ entram: 5, ficamDeFora: 0, excede: false });
    expect(revisaoFinal(2, 40)).toEqual({ entram: 2, ficamDeFora: 0, excede: false });
  });

  it('acima do saldo, entram só os que cabem e o resto fica de fora', () => {
    expect(revisaoFinal(9, 5)).toEqual({ entram: 5, ficamDeFora: 4, excede: true });
  });

  it('saldo zerado deixa todos de fora', () => {
    expect(revisaoFinal(3, 0)).toEqual({ entram: 0, ficamDeFora: 3, excede: true });
  });

  it('sem saldo conhecido não inventa aviso', () => {
    expect(revisaoFinal(9, undefined)).toEqual({ entram: 9, ficamDeFora: 0, excede: false });
  });
});
