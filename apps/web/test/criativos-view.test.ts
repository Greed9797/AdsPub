import { describe, expect, it } from 'vitest';

import { estadoDaMidia, filtrarMidias, lerFiltroDeMidia, quadroDeValidacao } from '../src/lib/criativos-view';
import type { Asset } from '../src/lib/types';

const midia = (kind: 'image' | 'video', status: 'ok' | 'rejected', warnings: string[] = []) =>
  ({ kind, validation: { status, errors: status === 'rejected' ? ['HEVC não aceito'] : [], warnings } }) as Pick<Asset, 'kind' | 'validation'>;

describe('criativos-view (RDS-50)', () => {
  it('classifica a mídia: recusada, com aviso ou aprovada', () => {
    expect(estadoDaMidia(midia('image', 'rejected'))).toBe('recusada');
    expect(estadoDaMidia(midia('image', 'ok', ['Áudio MP3']))).toBe('com_aviso');
    expect(estadoDaMidia(midia('image', 'ok'))).toBe('aprovada');
  });

  it('o quadro soma por estado e por tipo, e as utilizáveis incluem as com aviso', () => {
    const quadro = quadroDeValidacao([
      midia('image', 'ok'),
      midia('image', 'ok'),
      midia('image', 'ok', ['aviso']),
      midia('image', 'rejected'),
      midia('video', 'ok', ['aviso']),
      midia('video', 'rejected'),
    ]);
    expect(quadro).toMatchObject({ total: 6, aprovadas: 2, comAviso: 2, recusadas: 2, utilizaveis: 4 });
    expect(quadro.imagens).toEqual({ total: 4, aprovadas: 2, comAviso: 1, recusadas: 1 });
    expect(quadro.videos).toEqual({ total: 2, aprovadas: 0, comAviso: 1, recusadas: 1 });
  });

  it('o quadro de uma biblioteca vazia é zero, sem divisão', () => {
    expect(quadroDeValidacao([])).toMatchObject({ total: 0, utilizaveis: 0 });
  });

  it('filtra pela lista, mantendo a ordem', () => {
    const lista = [midia('image', 'ok'), midia('video', 'rejected'), midia('image', 'ok', ['x'])];
    expect(filtrarMidias(lista, 'todas')).toHaveLength(3);
    expect(filtrarMidias(lista, 'aprovadas')).toEqual([lista[0]]);
    expect(filtrarMidias(lista, 'com_aviso')).toEqual([lista[2]]);
    expect(filtrarMidias(lista, 'recusadas')).toEqual([lista[1]]);
  });

  it('lê o filtro da URL e cai em todas quando o valor é estranho', () => {
    expect(lerFiltroDeMidia('recusadas')).toBe('recusadas');
    expect(lerFiltroDeMidia('x')).toBe('todas');
    expect(lerFiltroDeMidia(undefined)).toBe('todas');
  });
});
