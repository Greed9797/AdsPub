import type { AdDraftStatus, Batch, BatchRef } from './types';

/** As 5 etapas que o worker cumpre na Meta, na ordem. */
export const ETAPAS = ['upload_media', 'ensure_campaign', 'ensure_adset', 'create_creative', 'create_ad'] as const;
export type Etapa = (typeof ETAPAS)[number];
export type EstadoEtapa = 'done' | 'current' | 'failed' | 'todo';

const ROTULO_ETAPA: Readonly<Record<Etapa, string>> = {
  upload_media: 'mídia',
  ensure_campaign: 'campanha',
  ensure_adset: 'conjunto',
  create_creative: 'criativo',
  create_ad: 'anúncio',
};

export interface EtapasDoAnuncio {
  segmentos: EstadoEtapa[];
  legenda: string;
}

const CONCLUIDOS: ReadonlySet<AdDraftStatus> = new Set(['published', 'in_review', 'approved', 'disapproved']);
const EM_VOO: ReadonlySet<AdDraftStatus> = new Set([
  'uploading_media',
  'ensuring_campaign',
  'ensuring_adset',
  'creating_creative',
  'creating_ad',
]);

function indiceDaEtapa(step: string | null): number {
  const i = ETAPAS.indexOf(step as Etapa);
  return i < 0 ? 0 : i;
}

function ate(indice: number, atual: EstadoEtapa): EstadoEtapa[] {
  return ETAPAS.map((_, i) => (i < indice ? 'done' : i === indice ? atual : 'todo'));
}

/** 5 segmentos por anúncio: o que a Meta já recebeu, onde está e onde parou. */
export function etapasDoAnuncio(status: AdDraftStatus, step: string | null): EtapasDoAnuncio {
  if (CONCLUIDOS.has(status) || step === 'done') {
    return { segmentos: ETAPAS.map(() => 'done'), legenda: 'concluído' };
  }
  const i = indiceDaEtapa(step);
  if (status === 'failed') {
    return { segmentos: ate(i, 'failed'), legenda: `falhou em ${ROTULO_ETAPA[ETAPAS[i]!]}` };
  }
  if (status === 'needs_reconciliation') {
    return { segmentos: ate(i, 'current'), legenda: `conferir ${ROTULO_ETAPA[ETAPAS[i]!]}` };
  }
  if (EM_VOO.has(status)) {
    return { segmentos: ate(i, 'current'), legenda: 'em andamento' };
  }
  const legenda = status === 'queued' ? 'na fila' : 'ainda não enviado';
  return { segmentos: ETAPAS.map(() => 'todo'), legenda };
}

export interface LinhaDaEstrutura {
  chave: string;
  tipo: 'campanha' | 'conjunto';
  rotulo: string;
  metaId: string | null;
  estado: BatchRef['state'];
  erro: string | null;
  anuncios: number;
}

/** Campanhas e conjuntos do lote, campanhas primeiro, com quantos anúncios usam cada um. */
export function estruturaDoLote(batch: Pick<Batch, 'items' | 'refs'>): LinhaDaEstrutura[] {
  const refs = batch.refs ?? [];
  const usos = (kind: 'campaign' | 'adset', chave: string) =>
    batch.items.filter((item) => {
      const ref = kind === 'campaign' ? item.campaign_ref : item.adset_ref;
      return ref.kind === 'new' && ref.key === chave;
    }).length;
  const linha = (ref: BatchRef, tipo: LinhaDaEstrutura['tipo'], n: number): LinhaDaEstrutura => ({
    chave: ref.ref_key,
    tipo,
    rotulo: tipo === 'campanha' ? 'Campanha' : `Conjunto ${n}`,
    metaId: ref.meta_id,
    estado: ref.state,
    erro: ref.last_error,
    anuncios: usos(ref.kind, ref.ref_key),
  });
  const campanhas = refs.filter((r) => r.kind === 'campaign').map((r) => linha(r, 'campanha', 0));
  const conjuntos = refs.filter((r) => r.kind === 'adset').map((r, i) => linha(r, 'conjunto', i + 1));
  return [...campanhas, ...conjuntos];
}
