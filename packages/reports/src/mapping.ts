/** T-003-1: dicionário PT/EN fixo. Fora daqui = `unmapped`, nunca chute. */
export const MAPPING_VERSION = 'v1';

export const CANONICAL_COLUMNS = [
  'ad_id',
  'ad_name',
  'date_start',
  'date_stop',
  'spend',
  'impressions',
  'link_clicks',
  'outbound_clicks',
  'primary_event_type',
  'primary_results',
  'primary_result_value',
  'video_plays',
  'video_thruplay',
  'video_avg_pct',
] as const;

export type CanonicalColumn = (typeof CANONICAL_COLUMNS)[number];

const ALIASES: Record<string, CanonicalColumn> = {
  ad_id: 'ad_id',
  'ad id': 'ad_id',
  id_do_anuncio: 'ad_id',
  ad_name: 'ad_name',
  'ad name': 'ad_name',
  nome_do_anuncio: 'ad_name',
  date_start: 'date_start',
  'date start': 'date_start',
  data_de_inicio: 'date_start',
  data_inicio: 'date_start',
  date_stop: 'date_stop',
  'date stop': 'date_stop',
  data_de_termino: 'date_stop',
  data_termino: 'date_stop',
  data_fim: 'date_stop',
  spend: 'spend',
  gasto: 'spend',
  valor_gasto: 'spend',
  amount_spent: 'spend',
  impressions: 'impressions',
  impressoes: 'impressions',
  link_clicks: 'link_clicks',
  'link clicks': 'link_clicks',
  cliques_no_link: 'link_clicks',
  outbound_clicks: 'outbound_clicks',
  'outbound clicks': 'outbound_clicks',
  cliques_de_saida: 'outbound_clicks',
  primary_event_type: 'primary_event_type',
  event: 'primary_event_type',
  evento: 'primary_event_type',
  evento_de_conversao: 'primary_event_type',
  primary_results: 'primary_results',
  results: 'primary_results',
  resultados: 'primary_results',
  primary_result_value: 'primary_result_value',
  'result value': 'primary_result_value',
  valor_de_resultados: 'primary_result_value',
  valor_de_conversao: 'primary_result_value',
  video_plays: 'video_plays',
  video_thruplay: 'video_thruplay',
  video_avg_pct: 'video_avg_pct',
};

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s\-/]+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

export interface MappingProposal {
  mapping: Record<string, CanonicalColumn | null>;
  unmapped: string[];
  version: typeof MAPPING_VERSION;
}

/** Uma coluna canônica, no máximo uma origem (primeira vence, resto unmapped). */
export function suggestMapping(headers: readonly string[]): MappingProposal {
  const mapping: Record<string, CanonicalColumn | null> = {};
  const unmapped: string[] = [];
  const taken = new Set<CanonicalColumn>();
  for (const header of headers) {
    const canonical = ALIASES[normalizeHeader(header)] ?? null;
    if (canonical && !taken.has(canonical)) {
      mapping[header] = canonical;
      taken.add(canonical);
    } else {
      mapping[header] = null;
      unmapped.push(header);
    }
  }
  return { mapping, unmapped, version: MAPPING_VERSION };
}
