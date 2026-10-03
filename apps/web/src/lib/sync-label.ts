const FUSO = 'America/Sao_Paulo';

interface Partes {
  dia: string;
  mes: string;
  ano: string;
  hora: string;
  minuto: string;
}

function partes(data: Date): Partes {
  const out: Record<string, string> = {};
  for (const parte of new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(data)) {
    out[parte.type] = parte.value;
  }
  return { dia: out.day, mes: out.month, ano: out.year, hora: out.hour === '24' ? '00' : out.hour, minuto: out.minute };
}

/** "Sincronizado hoje, 14:32" ou "Sincronizado 02/10, 14:32". Usa a sincronização mais recente. */
export function rotuloDeSincronizacao(syncs: ReadonlyArray<string | null>, agora: Date = new Date()): string | undefined {
  const datas = syncs.filter((value): value is string => Boolean(value)).map((value) => new Date(value));
  if (datas.length === 0) return undefined;
  const maisRecente = datas.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
  const p = partes(maisRecente);
  const hoje = partes(agora);
  const mesmoDia = p.dia === hoje.dia && p.mes === hoje.mes && p.ano === hoje.ano;
  return `Sincronizado ${mesmoDia ? 'hoje' : `${p.dia}/${p.mes}`}, ${p.hora}:${p.minuto}`;
}

/** Falha da API vira "sem rótulo": a casca nunca derruba a página. */
export async function carregarRotulo(
  loader: () => Promise<ReadonlyArray<{ last_synced_at: string | null }>>,
  agora: Date = new Date(),
): Promise<string | undefined> {
  try {
    const contas = await loader();
    return rotuloDeSincronizacao(
      contas.map((conta) => conta.last_synced_at),
      agora,
    );
  } catch {
    return undefined;
  }
}
