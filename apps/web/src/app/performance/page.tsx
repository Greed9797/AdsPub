import { Button, Card, Empty, Field, PageHead, Selo, Table, TableCell, TableRow, inputClass } from '@/components/ui';
import { api } from '@/lib/api';
import {
  descreverPeriodo,
  dinheiro,
  maioresGastos,
  rotuloDaFonte,
  totalDaTabela,
} from '@/lib/performance-view';
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
  rows: Array<{
    id: string;
    name: string;
    spend: number;
    results: number;
    days: number;
    cpa: number | null;
  }>;
  cohort: { comparable: boolean; limitations: string[] };
  verdict: { sufficiency: string; winnerId: string | null; reason: string };
  sources: {
    filter: string;
    snapshots: string[];
    observed_at_max: string | null;
    observations: number;
  };
}

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

  const barras = data ? maioresGastos(data.rows) : [];
  const totalTabela = data ? totalDaTabela(data.rows) : { spend: 0, results: 0 };

  return (
    <div className="ap-lotes">
      <PageHead
        title="Performance"
        description="Compare gasto e resultados por anúncio, com período e origem dos dados sempre visíveis."
      />
      <form method="get" action="/performance" aria-label="Filtrar performance" className="ap-lotes__filters">
        <Field label="Conta">
          <select id="perf-conta" name="ad_account_id" defaultValue={params.ad_account_id ?? ''} className={inputClass}>
            <option value="">Selecione</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="De">
          <input id="perf-de" type="date" name="from" defaultValue={params.from ?? ''} className={inputClass} />
        </Field>
        <Field label="Até">
          <input id="perf-ate" type="date" name="to" defaultValue={params.to ?? ''} className={inputClass} />
        </Field>
        <Field label="Fonte">
          <select id="perf-fonte" name="source" defaultValue={params.source ?? ''} className={inputClass}>
            <option value="">Todas</option>
            <option value="file">Arquivo</option>
            <option value="api">API</option>
          </select>
        </Field>
        <Button variant="secondary" label="Consultar" type="submit" />
      </form>

      <p className="ap-perf__escopo ap-t-label" aria-label="Período e origem dos dados">
        Período: {descreverPeriodo(params.from, params.to)} · Origem: {rotuloDaFonte(params.source)}
      </p>

      {!data ? (
        <Card>
          <Empty title="Nenhum recorte selecionado" hint="Selecione uma conta para ver os números." />
        </Card>
      ) : (
        <>
          <section aria-label="Totais" className="ap-perf__kpis">
            <Card variant="stat">
              <p className="ap-t-label ap-perf__rotulo">Gasto</p>
              <p className="ap-t-num-l ap-perf__valor">{dinheiro(data.totals.spend)}</p>
            </Card>
            <Card variant="stat">
              <p className="ap-t-label ap-perf__rotulo">Impressões</p>
              <p className="ap-t-num-l ap-perf__valor">{data.totals.impressions.toLocaleString('pt-BR')}</p>
            </Card>
            <Card variant="stat">
              <p className="ap-t-label ap-perf__rotulo">Custo por resultado</p>
              <p className="ap-t-num-l ap-perf__valor">{data.totals.cpa.value === null ? '—' : dinheiro(data.totals.cpa.value)}</p>
              {data.totals.cpa.value === null ? (
                <p className="ap-t-small ap-perf__rotulo">indisponível ({data.totals.cpa.reason})</p>
              ) : null}
            </Card>
            <Card variant="stat">
              <p className="ap-t-label ap-perf__rotulo">Retorno sobre gasto (ROAS)</p>
              <p className="ap-t-num-l ap-perf__valor">{data.totals.roas.value === null ? '—' : dinheiro(data.totals.roas.value)}</p>
              {data.totals.roas.value === null ? (
                <p className="ap-t-small ap-perf__rotulo">indisponível ({data.totals.roas.reason})</p>
              ) : null}
            </Card>
          </section>
          <p className="ap-perf__fonte ap-t-small">
            Fonte: {data.sources.filter} · {data.sources.observations} observações · {data.sources.snapshots.length} snapshot(s) ·
            atualizado em {data.sources.observed_at_max ?? '—'} · definições {data.metric_version}
          </p>

          {barras.length > 0 ? (
            <Card title="Gasto por anúncio" action={<Selo tone="neutro" label={`top ${barras.length}`} />}>
              <ul className="ap-perf__barras">
                {barras.map((barra) => (
                  <li key={barra.id}>
                    <div className="ap-perf__barra-head">
                      <span className="ap-t-body-strong ap-perf__nome">{barra.name}</span>
                      <span className="ap-t-num-s">{dinheiro(barra.spend)}</span>
                    </div>
                    <span className="ap-perf__trilho">
                      <i data-vencedor={data.verdict.winnerId === barra.id ? 'true' : undefined} style={{ width: `${barra.percentual}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {!data.cohort.comparable ? (
            <Card title="Limitações">
              <ul className="ap-perf__limites">
                {data.cohort.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title={`Ranking · ${data.rows.length}`} action={<Selo tone="neutro" label={data.verdict.sufficiency} />}>
            {data.rows.length === 0 ? (
              <Empty title="Sem observações no recorte" hint="Ajuste o período ou a fonte e consulte de novo." />
            ) : (
              <Table head={['Anúncio', 'Gasto', 'Resultados', 'Dias', 'CPA', '']}>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="ap-t-body-strong">{row.name || row.id}</TableCell>
                    <TableCell className="numeric">{dinheiro(row.spend)}</TableCell>
                    <TableCell className="numeric">{row.results}</TableCell>
                    <TableCell className="numeric">{row.days}</TableCell>
                    <TableCell className="numeric">{row.cpa === null ? '—' : dinheiro(row.cpa)}</TableCell>
                    <TableCell>{data.verdict.winnerId === row.id ? <Selo tone="publicado" label="vencedor" /> : null}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="ap-perf__total">
                  <TableCell className="ap-t-body-strong">Total da tabela</TableCell>
                  <TableCell className="numeric" data-total="gasto">
                    {dinheiro(totalTabela.spend)}
                  </TableCell>
                  <TableCell className="numeric">{totalTabela.results}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                </TableRow>
              </Table>
            )}
          </Card>
          <p className="ap-t-small ap-perf__fonte">{data.verdict.reason}</p>
        </>
      )}
    </div>
  );
}
