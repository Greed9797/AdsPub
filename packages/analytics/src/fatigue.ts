/** T-009-2: regra de fadiga versionada. Informativa — nunca muta Meta. */
export const FATIGUE_RULE_VERSION = 'fatigue.v1';

export interface FatiguePoint {
  date: string;
  spend: number;
  results: number | null;
  impressions: number;
}

export interface FatigueRule {
  version: string;
  minSpend: number;
  minImpressions: number;
  cpaRisePct: number;
}

export interface FatigueResult {
  fatigued: boolean;
  currentCpa: number | null;
  previousCpa: number | null;
  reason: string;
  confounders: string[];
}

const CONFOUNDERS = [
  'orçamento e lances podem ter mudado no período',
  'público, posicionamento e sazonalidade afetam CPA',
  'atribuição e maturação de conversões ainda em curso',
];

function cpa(points: readonly FatiguePoint[]): number | null {
  const spend = points.reduce((a, p) => a + p.spend, 0);
  const results = points.reduce((a, p) => a + (p.results ?? 0), 0);
  const hasResults = points.some((p) => p.results !== null);
  if (!hasResults || results <= 0) return null;
  return spend / results;
}

function volume(points: readonly FatiguePoint[]): { spend: number; impressions: number } {
  return {
    spend: points.reduce((a, p) => a + p.spend, 0),
    impressions: points.reduce((a, p) => a + p.impressions, 0),
  };
}

/** Janela atual vs anterior equivalente. Sem volume ou sem CPA, sem alerta. */
export function detectFatigue(
  current: readonly FatiguePoint[],
  previous: readonly FatiguePoint[],
  rule: FatigueRule,
): FatigueResult {
  const cur = volume(current);
  if (cur.spend < rule.minSpend || cur.impressions < rule.minImpressions) {
    return {
      fatigued: false,
      currentCpa: null,
      previousCpa: null,
      reason: `amostra insuficiente (gasto ${cur.spend} < ${rule.minSpend} ou impressões ${cur.impressions} < ${rule.minImpressions})`,
      confounders: CONFOUNDERS,
    };
  }
  const currentCpa = cpa(current);
  const previousCpa = cpa(previous);
  if (currentCpa === null || previousCpa === null || previousCpa <= 0) {
    return {
      fatigued: false,
      currentCpa,
      previousCpa,
      reason: 'CPA incomparável (sem resultados em alguma janela)',
      confounders: CONFOUNDERS,
    };
  }
  const risePct = ((currentCpa - previousCpa) / previousCpa) * 100;
  if (risePct < rule.cpaRisePct) {
    return {
      fatigued: false,
      currentCpa,
      previousCpa,
      reason: `alta de ${risePct.toFixed(1)}% abaixo do limiar ${rule.cpaRisePct}% (${rule.version})`,
      confounders: CONFOUNDERS,
    };
  }
  return {
    fatigued: true,
    currentCpa,
    previousCpa,
    reason: `CPA subiu ${risePct.toFixed(1)}% vs janela anterior equivalente (${rule.version})`,
    confounders: CONFOUNDERS,
  };
}
