/** T-005-1: fórmulas canônicas §5. `metric_version` trava a definição. */
export const METRIC_VERSION = 'v1';

export interface MetricValue {
  value: number | null;
  /** Presente quando indisponível: motivo, nunca zero inventado. */
  reason?: string;
}

export interface MetricInput {
  id: string;
  spend?: number;
  impressions?: number;
  linkClicks?: number;
  outboundClicks?: number;
  primaryResults?: number;
  primaryResultValue?: number;
}

export interface MetricTotals {
  spend: number;
  impressions: number;
  linkClicks: number;
  outboundClicks: number;
  results: number | null;
  resultValue: number | null;
  cpm: MetricValue;
  ctrLink: MetricValue;
  ctrOutbound: MetricValue;
  cpcLink: MetricValue;
  cpa: MetricValue;
  roas: MetricValue;
}

const num = (value: number | undefined): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Soma numeradores/denominadores — nunca média de taxas (AC-005-01). */
export function computeTotals(rows: readonly MetricInput[]): MetricTotals {
  const spend = rows.reduce((a, r) => a + num(r.spend), 0);
  const impressions = rows.reduce((a, r) => a + num(r.impressions), 0);
  const linkClicks = rows.reduce((a, r) => a + num(r.linkClicks), 0);
  const outboundClicks = rows.reduce((a, r) => a + num(r.outboundClicks), 0);
  const hasResults = rows.some((r) => r.primaryResults !== undefined);
  const hasValue = rows.some((r) => r.primaryResultValue !== undefined);
  const results = hasResults ? rows.reduce((a, r) => a + num(r.primaryResults), 0) : null;
  const resultValue = hasValue ? rows.reduce((a, r) => a + num(r.primaryResultValue), 0) : null;

  const ratio = (n: number, d: number, emptyReason: string): MetricValue =>
    d > 0 ? { value: n / d } : { value: null, reason: emptyReason };

  return {
    spend,
    impressions,
    linkClicks,
    outboundClicks,
    results,
    resultValue,
    cpm: ratio(1000 * spend, impressions, 'sem impressões no período'),
    ctrLink: ratio(100 * linkClicks, impressions, 'sem impressões no período'),
    ctrOutbound: ratio(100 * outboundClicks, impressions, 'sem impressões no período'),
    cpcLink: ratio(spend, linkClicks, 'sem cliques no período'),
    // AC-005-02: com gasto e zero compras, "sem compras" — nunca CPA zero.
    cpa:
      results === null
        ? { value: null, reason: 'sem resultados do evento no período' }
        : results > 0
          ? { value: spend / results }
          : { value: null, reason: 'sem compras no período' },
    roas:
      resultValue === null
        ? { value: null, reason: 'sem receita atribuída no período' }
        : spend > 0
          ? { value: resultValue / spend }
          : { value: null, reason: 'sem gasto no período' },
  };
}

/**
 * Alcance/únicos não somam (AC-005-04). Sem recorte agregado compatível, o
 * indicador é indisponível — a chamada recebe o que existe, não uma soma.
 */
export function aggregateReach(_dailyReach: readonly number[]): MetricValue {
  return { value: null, reason: 'alcance diário não soma: sem recorte agregado do período' };
}
