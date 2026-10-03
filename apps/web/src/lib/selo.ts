import { statusLabel } from './labels';

/** As 13 variantes do selo do Figma, mais "neutro" para o que o código não conhece. */
export type SeloTone =
  | 'rascunho'
  | 'bloqueado'
  | 'pronto'
  | 'fila'
  | 'publicando'
  | 'publicado'
  | 'analise'
  | 'aprovado'
  | 'reprovado'
  | 'falhou'
  | 'conferir'
  | 'leitura'
  | 'ativa'
  | 'neutro';

export interface SeloInfo {
  tone: SeloTone;
  label: string;
}

const PUBLICANDO: SeloInfo = { tone: 'publicando', label: 'Publicando' };

/** Vocabulário de estado: anúncios (`AdDraftStatus`), lotes (`BatchStatus`) e conexões. */
const POR_STATUS: Readonly<Record<string, SeloInfo>> = {
  // anúncio
  draft: { tone: 'rascunho', label: 'Rascunho' },
  blocked: { tone: 'bloqueado', label: 'Bloqueado' },
  ready: { tone: 'pronto', label: 'Pronto' },
  queued: { tone: 'fila', label: 'Na fila' },
  uploading_media: PUBLICANDO,
  ensuring_campaign: PUBLICANDO,
  ensuring_adset: PUBLICANDO,
  creating_creative: PUBLICANDO,
  creating_ad: PUBLICANDO,
  published: { tone: 'publicado', label: 'Publicado' },
  in_review: { tone: 'analise', label: 'Em análise' },
  approved: { tone: 'aprovado', label: 'Aprovado' },
  disapproved: { tone: 'reprovado', label: 'Reprovado' },
  failed: { tone: 'falhou', label: 'Falhou' },
  needs_reconciliation: { tone: 'conferir', label: 'Conferir' },
  // lote
  publishing: PUBLICANDO,
  done: { tone: 'publicado', label: 'Concluído' },
  partial: { tone: 'falhou', label: 'Parcial' },
  archived: { tone: 'neutro', label: 'Arquivado' },
  // conexão e conta
  active: { tone: 'ativa', label: 'Ativa' },
};

export function seloParaStatus(status: string): SeloInfo {
  return POR_STATUS[status] ?? { tone: 'neutro', label: statusLabel(status) };
}
