import { describe, expect, it } from 'vitest';

import {
  ESTADOS,
  barraDoLote,
  contarLotes,
  contarPorGrupo,
  filaDePublicacao,
  filtrarLotes,
  grupoDoItem,
  precisamAtencao,
  type EstadoGrupo,
} from '../src/lib/lotes-view';
import type { AdDraftStatus, Batch, BatchStatus } from '../src/lib/types';

function lote(
  id: string,
  statuses: AdDraftStatus[],
  extra: { status?: BatchStatus; approved?: boolean } = {},
): Batch {
  return {
    id,
    name: `Lote ${id}`,
    status: extra.status ?? 'draft',
    approval: extra.approved === undefined ? undefined : { approved: extra.approved, validated_at: null },
    items: statuses.map((status, i) => ({ id: `${id}-${i}`, status })),
  } as unknown as Batch;
}

describe('lotes-view: grupos de estado (RDS-10)', () => {
  it('lista os 11 grupos na ordem do quadro, com Falhou e Conferir ao final', () => {
    expect(ESTADOS).toEqual([
      'rascunho', 'bloqueado', 'pronto', 'fila', 'publicando', 'publicado',
      'analise', 'aprovado', 'reprovado', 'falhou', 'conferir',
    ]);
  });

  const MAPA: Array<[AdDraftStatus, EstadoGrupo]> = [
    ['draft', 'rascunho'],
    ['blocked', 'bloqueado'],
    ['ready', 'pronto'],
    ['queued', 'fila'],
    ['uploading_media', 'publicando'],
    ['ensuring_campaign', 'publicando'],
    ['ensuring_adset', 'publicando'],
    ['creating_creative', 'publicando'],
    ['creating_ad', 'publicando'],
    ['published', 'publicado'],
    ['in_review', 'analise'],
    ['approved', 'aprovado'],
    ['disapproved', 'reprovado'],
    ['failed', 'falhou'],
    ['needs_reconciliation', 'conferir'],
  ];

  it.each(MAPA)('mapeia o status %s para o grupo %s', (status, grupo) => {
    expect(grupoDoItem(status)).toBe(grupo);
  });

  it('conta 1 ponto por anúncio, somando todos os lotes', () => {
    const contagem = contarPorGrupo([
      lote('a', ['draft', 'draft', 'ready']),
      lote('b', ['published', 'uploading_media', 'failed']),
    ]);
    expect(contagem.rascunho).toBe(2);
    expect(contagem.pronto).toBe(1);
    expect(contagem.publicado).toBe(1);
    expect(contagem.publicando).toBe(1);
    expect(contagem.falhou).toBe(1);
    expect(Object.values(contagem).reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('devolve zero em todos os grupos quando não há lotes', () => {
    expect(Object.values(contarPorGrupo([]))).toEqual(Array(11).fill(0));
  });
});

describe('lotes-view: atenção (RDS-11)', () => {
  it('soma bloqueado, reprovado, falhou e conferir, e nada mais', () => {
    const contagem = contarPorGrupo([
      lote('a', ['blocked', 'blocked', 'disapproved', 'failed', 'needs_reconciliation']),
      lote('b', ['draft', 'ready', 'queued', 'published', 'in_review', 'approved']),
    ]);
    expect(precisamAtencao(contagem)).toBe(5);
  });
});

describe('lotes-view: barra de pipeline (RDS-13)', () => {
  it('cria um segmento por grupo presente, na ordem do quadro, com largura proporcional', () => {
    const barra = barraDoLote(lote('a', ['published', 'published', 'ready', 'failed']), 20);
    expect(barra.total).toBe(4);
    expect(barra.largura).toBe(80);
    expect(barra.segmentos).toEqual([
      { grupo: 'pronto', n: 1, largura: 20 },
      { grupo: 'publicado', n: 2, largura: 40 },
      { grupo: 'falhou', n: 1, largura: 20 },
    ]);
  });

  it('usa 18 px por anúncio quando a escala não é informada', () => {
    expect(barraDoLote(lote('a', ['draft', 'draft', 'draft'])).largura).toBe(54);
  });

  it('devolve barra vazia, sem erro de divisão, para lote sem anúncios', () => {
    expect(barraDoLote(lote('a', []))).toEqual({ total: 0, largura: 0, segmentos: [] });
  });
});

describe('lotes-view: fila de publicação (RDS-14)', () => {
  it('inclui só lotes ready com a aprovação válida', () => {
    const fila = filaDePublicacao([
      lote('ok', ['ready'], { status: 'ready', approved: true }),
      lote('sem-aprovacao', ['ready'], { status: 'ready', approved: false }),
      lote('sem-campo', ['ready'], { status: 'ready' }),
      lote('rascunho', ['draft'], { status: 'draft', approved: true }),
      lote('fila', ['queued'], { status: 'queued', approved: true }),
    ]);
    expect(fila.map((b) => b.id)).toEqual(['ok']);
  });
});

describe('lotes-view: filtro da lista (RDS-12)', () => {
  const lotes = [
    lote('a', ['ready', 'ready']),
    lote('b', ['blocked', 'draft']),
    lote('c', ['published', 'in_review']),
    lote('d', []),
  ];

  it('devolve todos os lotes, na mesma ordem, sem filtro', () => {
    expect(filtrarLotes(lotes).map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filtra por grupo: só lotes com ao menos um anúncio no estado', () => {
    expect(filtrarLotes(lotes, 'pronto').map((b) => b.id)).toEqual(['a']);
    expect(filtrarLotes(lotes, 'analise').map((b) => b.id)).toEqual(['c']);
  });

  it('o filtro atenção reúne lotes com anúncio bloqueado, reprovado, falhou ou conferir', () => {
    expect(filtrarLotes(lotes, 'atencao').map((b) => b.id)).toEqual(['b']);
  });

  it('conta lotes por filtro, incluindo todos', () => {
    expect(contarLotes(lotes, 'todos')).toBe(4);
    expect(contarLotes(lotes, 'atencao')).toBe(1);
    expect(contarLotes(lotes, 'pronto')).toBe(1);
    expect(contarLotes(lotes, 'publicando')).toBe(0);
  });
});
