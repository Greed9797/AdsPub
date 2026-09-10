/** T-005-2: coorte comparável ou limitação explícita. Sem placar global. */
export interface CohortRow {
  id: string;
  accountId: string;
  currency: string;
  attribution: string;
  primaryEvent: string;
}

export interface Cohort {
  comparable: boolean;
  limitations: string[];
}

/** Mesma conta + moeda + atribuição + evento = descritivo; resto é limitação. */
export function checkCohort(rows: readonly CohortRow[]): Cohort {
  const limitations: string[] = [];
  const same = (pick: (r: CohortRow) => string): boolean =>
    rows.every((r) => pick(r) === pick(rows[0]!));
  if (rows.length === 0) return { comparable: false, limitations: ['sem linhas no recorte'] };
  if (!same((r) => r.accountId)) limitations.push('contas distintas: sem ranking entre contas');
  if (!same((r) => r.currency)) limitations.push('moedas distintas: sem ranking entre moedas');
  if (!same((r) => r.attribution)) limitations.push('atribuições distintas: sem recomendação de vencedor');
  if (!same((r) => r.primaryEvent)) limitations.push('eventos distintos: sem recomendação de vencedor');
  return { comparable: limitations.length === 0, limitations };
}

/** T-005-2: política de suficiência versionada por cliente. */
export interface SufficiencyPolicy {
  version: string;
  minSpend: number;
  minResults: number;
  minDays: number;
  maturityDays: number;
}

export interface VerdictInput {
  id: string;
  spend: number;
  results: number;
  daysActive: number;
}

export interface Verdict {
  sufficiency: 'evaluated' | 'unevaluated';
  winnerId: string | null;
  reason: string;
}

/**
 * Sem política completa → ranking descritivo fora daqui + `unevaluated`.
 * Com política → vencedor = menor CPA entre elegíveis, critério registrado.
 */
export function evaluateVerdict(
  rows: readonly VerdictInput[],
  policy?: SufficiencyPolicy | null,
): Verdict {
  if (!policy) {
    return { sufficiency: 'unevaluated', winnerId: null, reason: 'suficiência não avaliada: sem política configurada' };
  }
  const eligible = rows.filter(
    (r) => r.spend >= policy.minSpend && r.results >= policy.minResults && r.daysActive >= policy.minDays,
  );
  if (eligible.length === 0) {
    return {
      sufficiency: 'evaluated',
      winnerId: null,
      reason: `nenhum elegível pela política ${policy.version} (gasto≥${policy.minSpend}, resultados≥${policy.minResults}, dias≥${policy.minDays})`,
    };
  }
  const winner = eligible.reduce((a, b) => (a.spend / Math.max(a.results, 1) <= b.spend / Math.max(b.results, 1) ? a : b));
  return {
    sufficiency: 'evaluated',
    winnerId: winner.id,
    reason: `menor CPA entre ${eligible.length} elegível(is) pela política ${policy.version}`,
  };
}
