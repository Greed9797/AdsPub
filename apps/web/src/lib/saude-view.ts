import type { AccountHealth } from './types';

export const CONNECTION_LABELS: Readonly<Record<string, string>> = {
  active: 'Ativa',
  needs_attention: 'Requer atenção',
  revoked: 'Revogada',
  unknown: 'Desconhecida',
};

/** Acima disso a conta entra em atenção (10% das chamadas na última hora). */
export const ERROR_RATE_LIMIT = 0.1;

export type LinhaSaude = AccountHealth & { alertas: string[] };

export function formatarPercentual(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatarData(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

export function alertasDaConta(row: AccountHealth): string[] {
  const alertas: string[] = [];
  if (row.connection_status !== 'active') {
    alertas.push(`Conexão ${CONNECTION_LABELS[row.connection_status] ?? row.connection_status}`);
  }
  if (row.paused_until !== null) {
    alertas.push(`Publicação pausada até ${formatarData(row.paused_until)}`);
  }
  if (row.published_today >= row.daily_cap) {
    alertas.push('Teto diário de anúncios atingido');
  }
  if (row.error_rate_1h > ERROR_RATE_LIMIT) {
    alertas.push(`Erro em ${formatarPercentual(row.error_rate_1h)} das chamadas na última hora`);
  }
  return alertas;
}

/** Contas em atenção primeiro (mais alertas antes); empate mantém a ordem da API. */
export function linhasDeSaude(rows: readonly AccountHealth[]): LinhaSaude[] {
  return rows
    .map((row, indice) => ({ linha: { ...row, alertas: alertasDaConta(row) }, indice }))
    .sort((a, b) => b.linha.alertas.length - a.linha.alertas.length || a.indice - b.indice)
    .map(({ linha }) => linha);
}

export interface ResumoDeSaude {
  contas: number;
  emAtencao: number;
  noTeto: number;
  erroMedio: number;
}

export function resumoDeSaude(linhas: readonly LinhaSaude[]): ResumoDeSaude {
  return {
    contas: linhas.length,
    emAtencao: linhas.filter((l) => l.alertas.length > 0).length,
    noTeto: linhas.filter((l) => l.published_today >= l.daily_cap).length,
    erroMedio: linhas.length === 0 ? 0 : linhas.reduce((soma, l) => soma + l.error_rate_1h, 0) / linhas.length,
  };
}

export function descreverRateUsage(rateUsage: Record<string, unknown>): string {
  const entradas = Object.entries(rateUsage).filter((e): e is [string, number] => typeof e[1] === 'number');
  if (entradas.length === 0) return 'Sem dados';
  return entradas.map(([nome, valor]) => `${nome}: ${valor.toLocaleString('pt-BR')}`).join(' · ');
}

export { formatarData };
