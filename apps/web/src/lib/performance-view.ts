export interface LinhaDePerformance {
  id: string;
  name: string;
  spend: number;
  results: number;
  days: number;
  cpa: number | null;
}

export function dinheiro(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Soma da tabela: é o que o KPI de gasto precisa igualar. */
export function totalDaTabela(rows: readonly LinhaDePerformance[]): { spend: number; results: number } {
  return rows.reduce((total, row) => ({ spend: total.spend + row.spend, results: total.results + row.results }), {
    spend: 0,
    results: 0,
  });
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataBr(value: string): string {
  const [ano, mes, dia] = value.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** O período sempre aparece, mesmo sem filtro: "todo o histórico" é uma informação. */
export function descreverPeriodo(from: string | undefined, to: string | undefined): string {
  const de = from && DATA.test(from) ? dataBr(from) : undefined;
  const ate = to && DATA.test(to) ? dataBr(to) : undefined;
  if (de && ate) return `${de} a ${ate}`;
  if (de) return `a partir de ${de}`;
  if (ate) return `até ${ate}`;
  return 'todo o histórico';
}

export function rotuloDaFonte(source: string | undefined): string {
  if (source === 'file') return 'arquivo importado';
  if (source === 'api') return 'API da Meta';
  return 'todas as fontes';
}

export interface BarraDeGasto {
  id: string;
  name: string;
  spend: number;
  /** Largura relativa ao maior gasto, de 0 a 100. */
  percentual: number;
}

/** Os maiores gastos, do maior para o menor, com largura proporcional ao primeiro. */
export function maioresGastos(rows: readonly LinhaDePerformance[], limite = 8): BarraDeGasto[] {
  const ordenadas = [...rows].sort((a, b) => b.spend - a.spend).slice(0, limite);
  const maximo = ordenadas[0]?.spend ?? 0;
  return ordenadas.map((row) => ({
    id: row.id,
    name: row.name || row.id,
    spend: row.spend,
    percentual: maximo > 0 ? (row.spend / maximo) * 100 : 0,
  }));
}
