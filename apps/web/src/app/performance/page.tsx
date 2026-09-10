import { Badge, Card, Empty, Field, PageHead, Table, buttonClass, inputClass } from '@/components/ui';
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
      <PageHead title="Performance" description="Números auditáveis antes da IA." />
      <Card>
        <form
          method="get"
          action="/performance"
          aria-label="Filtrar performance"
          className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]"
        >
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
          <div>
            <button className={buttonClass} type="submit">
              Consultar
            </button>
          </div>
        </form>
      </Card>

      {!data ? (
        <Card>
          <Empty title="Nenhum recorte selecionado" hint="Selecione uma conta para ver os números." />
        </Card>
      ) : (
        <>
          <Card title="Totais" action={<Badge tone="info">{data.metric_version}</Badge>}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">Gasto</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.03em]">{money(data.totals.spend)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  Impressões
                </dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.03em]">
                  {data.totals.impressions.toLocaleString('pt-BR')}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">CPA</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.03em]">
                  {data.totals.cpa.value === null ? '—' : money(data.totals.cpa.value)}
                </dd>
                {data.totals.cpa.value === null ? (
                  <dd className="mt-0.5 text-xs text-[var(--color-muted)]">indisponível ({data.totals.cpa.reason})</dd>
                ) : null}
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">ROAS</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.03em]">
                  {data.totals.roas.value === null ? '—' : money(data.totals.roas.value)}
                </dd>
                {data.totals.roas.value === null ? (
                  <dd className="mt-0.5 text-xs text-[var(--color-muted)]">indisponível ({data.totals.roas.reason})</dd>
                ) : null}
              </div>
            </dl>
            <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-muted)]">
              Fonte: {data.sources.filter} · {data.sources.observations} observações ·{' '}
              {data.sources.snapshots.length} snapshot(s) · atualizado em {data.sources.observed_at_max ?? '—'}
            </p>
          </Card>

          {data.rows.length > 0 ? (
            <Card title="Gasto por anúncio" action={<Badge tone="info">top {Math.min(8, data.rows.length)}</Badge>}>
              <ul className="space-y-3">
                {[...data.rows]
                  .sort((a, b) => b.spend - a.spend)
                  .slice(0, 8)
                  .map((row) => {
                    const max = Math.max(...data.rows.map((r) => r.spend), 0);
                    return (
                      <li key={row.id}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium">{row.name || row.id}</span>
                          <span className="shrink-0 tabular-nums text-[var(--color-muted)]">{money(row.spend)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                          <div
                            className={`h-full rounded-full ${data.verdict.winnerId === row.id ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-brand-solid)]'}`}
                            style={{ width: `${max > 0 ? (row.spend / max) * 100 : 0}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          ) : null}

          {!data.cohort.comparable ? (
            <Card title="Limitações">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {data.cohort.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title={`Ranking · ${data.rows.length}`} action={<Badge tone="info">{data.verdict.sufficiency}</Badge>}>
            {data.rows.length === 0 ? (
              <Empty title="Sem observações no recorte" hint="Ajuste o período ou a fonte e consulte de novo." />
            ) : (
              <Table head={['Anúncio', 'Gasto', 'Resultados', 'Dias', 'CPA', '']}>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="max-w-64 truncate px-3 py-2.5 font-medium first:pl-0">{row.name || row.id}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{money(row.spend)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.results}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.days}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                      {row.cpa === null ? '—' : money(row.cpa)}
                    </td>
                    <td className="px-3 py-2.5 text-right last:pr-0">
                      {data.verdict.winnerId === row.id ? <Badge tone="ok">vencedor</Badge> : null}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <p className="text-xs text-[var(--color-muted)]">{data.verdict.reason}</p>
        </>
      )}
    </div>
  );
}
