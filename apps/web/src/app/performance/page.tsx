import { Badge, Card, Empty, Eyebrow, Field, Table, buttonClass, inputClass } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { AdAccount } from '@/lib/types';

type SearchParams = {
  ad_account_id?: string | string[];
  from?: string | string[];
  to?: string | string[];
  source?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

interface Performance {
  metric_version: string;
  totals: {
    spend: number;
    impressions: number;
    cpa: { value: number | null; reason?: string };
    roas: { value: number | null; reason?: string };
  };
  rows: Array<{ id: string; name: string; spend: number; results: number; days: number; cpa: number | null }>;
  cohort: { comparable: boolean; limitations: string[] };
  verdict: { sufficiency: string; winnerId: string | null; reason: string };
  sources: { filter: string; snapshots: string[]; observed_at_max: string | null; observations: number };
}

const money = (value: number | null): string =>
  value === null ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** T-005-3: dashboard determinístico — origem e definição sempre visíveis. */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireSession();
  const raw = await searchParams;
  const params = {
    ad_account_id: first(raw.ad_account_id),
    from: first(raw.from),
    to: first(raw.to),
    source: first(raw.source),
  };

  const accounts = await api<AdAccount[]>('/ad-accounts');
  let data: Performance | null = null;
  if (params.ad_account_id) {
    const query = new URLSearchParams({ ad_account_id: params.ad_account_id });
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.source) query.set('source', params.source);
    data = await api<Performance>(`/performance?${query.toString()}`);
  }

  return (
    <div className="space-y-6">
      <Eyebrow>Números auditáveis antes da IA</Eyebrow>
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">Performance</h1>
      <Card title="Filtros">
        <form method="get" action="/performance" className="grid gap-3 md:grid-cols-5">
          <Field label="Conta">
            <select name="ad_account_id" defaultValue={params.ad_account_id ?? ''} className={inputClass}>
              <option value="">Selecione</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="De">
            <input type="date" name="from" defaultValue={params.from ?? ''} className={inputClass} />
          </Field>
          <Field label="Até">
            <input type="date" name="to" defaultValue={params.to ?? ''} className={inputClass} />
          </Field>
          <Field label="Fonte">
            <select name="source" defaultValue={params.source ?? ''} className={inputClass}>
              <option value="">Todas</option>
              <option value="file">Arquivo</option>
              <option value="api">API</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button className={buttonClass} type="submit">
              Consultar
            </button>
          </div>
        </form>
      </Card>

      {!data ? (
        <Card>
          <Empty>Selecione uma conta para ver os números.</Empty>
        </Card>
      ) : (
        <>
          <Card title="Totais">
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                Gasto: <strong>{money(data.totals.spend)}</strong>
              </span>
              <span>
                Impressões: <strong>{data.totals.impressions.toLocaleString('pt-BR')}</strong>
              </span>
              <span>
                CPA:{' '}
                <strong>{data.totals.cpa.value === null ? `indisponível (${data.totals.cpa.reason})` : money(data.totals.cpa.value)}</strong>
              </span>
              <span>
                ROAS:{' '}
                <strong>{data.totals.roas.value === null ? `indisponível (${data.totals.roas.reason})` : money(data.totals.roas.value)}</strong>
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Fonte: {data.sources.filter} · {data.sources.observations} observações ·{' '}
              {data.sources.snapshots.length} snapshot(s) · atualizado em {data.sources.observed_at_max ?? '—'} ·
              definições {data.metric_version}
            </p>
          </Card>

          {!data.cohort.comparable ? (
            <Card title="Limitações">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {data.cohort.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title={`Ranking (${data.verdict.sufficiency === 'evaluated' ? data.verdict.reason : 'descritivo: suficiência não avaliada'})`}>
            {data.rows.length === 0 ? (
              <Empty>Sem observações no recorte.</Empty>
            ) : (
              <Table head={['Anúncio', 'Gasto', 'Resultados', 'Dias', 'CPA', '']}>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{row.name || row.id}</td>
                    <td className="px-3 py-2">{money(row.spend)}</td>
                    <td className="px-3 py-2">{row.results}</td>
                    <td className="px-3 py-2">{row.days}</td>
                    <td className="px-3 py-2">{row.cpa === null ? '—' : money(row.cpa)}</td>
                    <td className="px-3 py-2">
                      {data.verdict.winnerId === row.id ? <Badge tone="ok">vencedor</Badge> : null}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
