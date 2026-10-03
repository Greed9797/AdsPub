export interface RevisaoFinal {
  /** Anúncios que a Meta recebe hoje. */
  entram: number;
  /** Anúncios que ficam para outro dia por causa do teto diário da conta. */
  ficamDeFora: number;
  excede: boolean;
}

/**
 * Quantos anúncios cabem hoje. `saldoDiario` vem do painel de saúde da conta;
 * sem ele (`undefined`) não há como avisar e a API segue aplicando o teto.
 */
export function revisaoFinal(elegiveis: number, saldoDiario: number | undefined): RevisaoFinal {
  if (saldoDiario === undefined || elegiveis <= saldoDiario) {
    return { entram: elegiveis, ficamDeFora: 0, excede: false };
  }
  const entram = Math.max(0, saldoDiario);
  return { entram, ficamDeFora: elegiveis - entram, excede: true };
}
