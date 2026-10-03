import { describe, expect, it } from 'vitest';

import { estruturaDoLote, etapasDoAnuncio } from '../src/lib/etapas';
import type { AdDraft, Batch, BatchRef } from '../src/lib/types';

describe('etapasDoAnuncio (RDS-20)', () => {
  it('anúncio ainda não enviado tem 5 segmentos vazios', () => {
    for (const status of ['draft', 'blocked', 'ready'] as const) {
      expect(etapasDoAnuncio(status, 'upload_media')).toEqual({
        segmentos: ['todo', 'todo', 'todo', 'todo', 'todo'],
        legenda: 'ainda não enviado',
      });
    }
  });

  it('na fila ainda não tocou a Meta', () => {
    expect(etapasDoAnuncio('queued', 'upload_media').legenda).toBe('na fila');
  });

  it('em voo marca as etapas anteriores como feitas e a atual como em curso', () => {
    expect(etapasDoAnuncio('creating_creative', 'create_creative')).toEqual({
      segmentos: ['done', 'done', 'done', 'current', 'todo'],
      legenda: 'em andamento',
    });
  });

  it('falhou aponta a etapa em que parou', () => {
    expect(etapasDoAnuncio('failed', 'ensure_adset')).toEqual({
      segmentos: ['done', 'done', 'failed', 'todo', 'todo'],
      legenda: 'falhou em conjunto',
    });
  });

  it('conferir marca a etapa incerta, sem dizer que concluiu', () => {
    expect(etapasDoAnuncio('needs_reconciliation', 'create_ad')).toEqual({
      segmentos: ['done', 'done', 'done', 'done', 'current'],
      legenda: 'conferir anúncio',
    });
  });

  it.each(['published', 'in_review', 'approved', 'disapproved'] as const)('%s está concluído', (status) => {
    expect(etapasDoAnuncio(status, 'done')).toEqual({
      segmentos: ['done', 'done', 'done', 'done', 'done'],
      legenda: 'concluído',
    });
  });

  it('etapa desconhecida cai na primeira, sem quebrar', () => {
    expect(etapasDoAnuncio('failed', 'nova_etapa').segmentos[0]).toBe('failed');
  });
});

describe('estruturaDoLote (RDS-27)', () => {
  const ref = (ref_key: string, kind: BatchRef['kind'], state: BatchRef['state'], meta_id: string | null = null): BatchRef => ({
    ref_key, kind, state, meta_id, last_error: null, updated_at: '2026-10-03T00:00:00Z',
  });
  const item = (c: string, a: string) =>
    ({ campaign_ref: { kind: 'new', key: c }, adset_ref: { kind: 'new', key: a } }) as unknown as AdDraft;

  it('lista a campanha primeiro e numera os conjuntos, com o uso de cada um', () => {
    const linhas = estruturaDoLote({
      items: [item('c1', 'a1'), item('c1', 'a1'), item('c1', 'a2')],
      refs: [ref('a1', 'adset', 'created', '12'), ref('c1', 'campaign', 'created', '11'), ref('a2', 'adset', 'needs_reconciliation')],
    } as Pick<Batch, 'items' | 'refs'>);
    expect(linhas.map((l) => [l.tipo, l.rotulo, l.estado, l.anuncios])).toEqual([
      ['campanha', 'Campanha', 'created', 3],
      ['conjunto', 'Conjunto 1', 'created', 2],
      ['conjunto', 'Conjunto 2', 'needs_reconciliation', 1],
    ]);
    expect(linhas[0]!.metaId).toBe('11');
  });

  it('lote sem refs devolve lista vazia', () => {
    expect(estruturaDoLote({ items: [], refs: undefined })).toEqual([]);
  });
});
