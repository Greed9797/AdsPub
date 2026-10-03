import type { AdDraftStatus, Batch } from './types';

/** Os 11 grupos do quadro de pontos. Falhou e Conferir ficam ao final (AD-002). */
export const ESTADOS = [
  'rascunho',
  'bloqueado',
  'pronto',
  'fila',
  'publicando',
  'publicado',
  'analise',
  'aprovado',
  'reprovado',
  'falhou',
  'conferir',
] as const;

export type EstadoGrupo = (typeof ESTADOS)[number];
export type FiltroLista = EstadoGrupo | 'atencao' | 'todos';
export type ContagemPorGrupo = Readonly<Record<EstadoGrupo, number>>;

const GRUPO_DO_STATUS: Readonly<Record<AdDraftStatus, EstadoGrupo>> = {
  draft: 'rascunho',
  blocked: 'bloqueado',
  ready: 'pronto',
  queued: 'fila',
  uploading_media: 'publicando',
  ensuring_campaign: 'publicando',
  ensuring_adset: 'publicando',
  creating_creative: 'publicando',
  creating_ad: 'publicando',
  published: 'publicado',
  in_review: 'analise',
  approved: 'aprovado',
  disapproved: 'reprovado',
  failed: 'falhou',
  needs_reconciliation: 'conferir',
};

export const ROTULO_GRUPO: Readonly<Record<EstadoGrupo, string>> = {
  rascunho: 'Rascunho',
  bloqueado: 'Bloqueado',
  pronto: 'Pronto',
  fila: 'Na fila',
  publicando: 'Publicando',
  publicado: 'Publicado',
  analise: 'Em análise',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  falhou: 'Falhou',
  conferir: 'Conferir',
};

/** Estados em que o anúncio pede ação de uma pessoa. */
const ATENCAO: readonly EstadoGrupo[] = ['bloqueado', 'reprovado', 'falhou', 'conferir'];

/** Largura de cada anúncio na barra de pipeline, em px. */
export const PX_POR_ANUNCIO = 18;

export function grupoDoItem(status: AdDraftStatus): EstadoGrupo {
  return GRUPO_DO_STATUS[status];
}

function contagemZerada(): Record<EstadoGrupo, number> {
  return Object.fromEntries(ESTADOS.map((grupo) => [grupo, 0])) as Record<EstadoGrupo, number>;
}

/** 1 ponto por anúncio, somando todos os lotes. Status que a API invente e o código não conheça é ignorado. */
export function contarPorGrupo(batches: readonly Batch[]): ContagemPorGrupo {
  const contagem = contagemZerada();
  for (const batch of batches) {
    for (const item of batch.items) {
      const grupo = GRUPO_DO_STATUS[item.status];
      if (grupo) contagem[grupo] += 1;
    }
  }
  return contagem;
}

export function precisamAtencao(contagem: ContagemPorGrupo): number {
  return ATENCAO.reduce((soma, grupo) => soma + contagem[grupo], 0);
}

export interface SegmentoDoLote {
  grupo: EstadoGrupo;
  n: number;
  largura: number;
}

export interface BarraDoLote {
  total: number;
  largura: number;
  segmentos: SegmentoDoLote[];
}

/** Um segmento por grupo presente, na ordem do quadro. Largura proporcional à contagem. */
export function barraDoLote(batch: Batch, pxPorAnuncio: number = PX_POR_ANUNCIO): BarraDoLote {
  const contagem = contarPorGrupo([batch]);
  const segmentos = ESTADOS.filter((grupo) => contagem[grupo] > 0).map((grupo) => ({
    grupo,
    n: contagem[grupo],
    largura: contagem[grupo] * pxPorAnuncio,
  }));
  const total = batch.items.length;
  return { total, largura: total * pxPorAnuncio, segmentos };
}

/** Lotes validados com a aprovação ainda válida, prontos para o "Revisar e publicar". */
export function filaDePublicacao(batches: readonly Batch[]): Batch[] {
  return batches.filter((batch) => batch.status === 'ready' && batch.approval?.approved === true);
}

function temItemEm(batch: Batch, grupos: readonly EstadoGrupo[]): boolean {
  return batch.items.some((item) => grupos.includes(GRUPO_DO_STATUS[item.status]));
}

/** Mantém a ordem. "atencao" reúne os grupos que pedem ação; um grupo filtra pelo estado do anúncio. */
export function filtrarLotes(batches: readonly Batch[], filtro: FiltroLista = 'todos'): Batch[] {
  if (filtro === 'todos') return [...batches];
  const grupos = filtro === 'atencao' ? ATENCAO : [filtro];
  return batches.filter((batch) => temItemEm(batch, grupos));
}

export function contarLotes(batches: readonly Batch[], filtro: FiltroLista): number {
  return filtrarLotes(batches, filtro).length;
}

export interface ColunaDoQuadro {
  grupo: EstadoGrupo;
  rotulo: string;
  n: number;
}

/** Uma coluna por grupo, na ordem do quadro, inclusive as zeradas. */
export function colunasDoQuadro(contagem: ContagemPorGrupo): ColunaDoQuadro[] {
  return ESTADOS.map((grupo) => ({ grupo, rotulo: ROTULO_GRUPO[grupo], n: contagem[grupo] }));
}
