import { Badge, Card, Empty, PageHead, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { AccountHealth } from '@/lib/types';

const CONNECTION_LABELS: Record<string, string> = {
  active: 'Ativa',
  needs_attention: 'Requer atenção',
  revoked: 'Revogada',
  unknown: 'Desconhecida',
};

/** Acima disso a conta entra em atenção no painel (10% das chamadas na última hora). */
const ERROR_RATE_LIMIT = 0.1;

type LinhaSaude = AccountHealth & { alertas: string[] };

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatRateUsage(rateUsage: Record<string, unknown>): string {
  const entries = Object.entries(rateUsage).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );

  if (entries.length === 0) return 'Sem dados';

  return entries.map(([name, value]) => `${name}: ${value.toLocaleString('pt-BR')}`).join(' · ');
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

function alertasDaConta(row: AccountHealth): string[] {
  const alertas: string[] = [];

  if (row.connection_status !== 'active') {
    alertas.push(`Conexão ${CONNECTION_LABELS[row.connection_status] ?? row.connection_status}`);
  }
  if (row.paused_until !== null) {
    alertas.push(`Publicação pausada até ${formatDate(row.paused_until)}`);
  }
  if (row.published_today >= row.daily_cap) {
    alertas.push('Teto diário de anúncios atingido');
  }
  if (row.error_rate_1h > ERROR_RATE_LIMIT) {
    alertas.push(`Erro em ${toPercent(row.error_rate_1h)} das chamadas na última hora`);
  }

  return alertas;
}

export default async function SaudePage() {
  await requireSession();

  const rows = await api<AccountHealth[]>('/health/accounts');
  const linhas: LinhaSaude[] = rows.map((row) => ({ ...row, alertas: alertasDaConta(row) }));
  const emAtencao = linhas.filter((linha) => linha.alertas.length > 0).length;
  const noTeto = linhas.filter((linha) => linha.published_today >= linha.daily_cap).length;
  const erroMedio =
    linhas.length === 0 ? 0 : linhas.reduce((soma, linha) => soma + linha.error_rate_1h, 0) / linhas.length;

  return (
    <div className="space-y-6">
      <PageHead
        title="Saúde das contas"
        description="Fila, rate limit, erros e teto diário."
        action={
          <Badge tone={emAtencao === 0 ? 'ok' : 'warn'}>
            {emAtencao === 0
              ? `${linhas.length} conta(s) sem alerta`
              : `${emAtencao} de ${linhas.length} conta(s) em atenção`}
          </Badge>
        }
      />

      <Card title="Resumo" variant="stat">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {[
            ['Contas', String(linhas.length), 'text-[var(--color-text)]'],
            ['Em atenção', String(emAtencao), emAtencao > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-ok)]'],
            ['Erro médio 1h', toPercent(erroMedio), erroMedio > ERROR_RATE_LIMIT ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'],
            ['No teto diário', String(noTeto), noTeto > 0 ? 'text-[var(--color-warn)]' : 'text-[var(--color-muted)]'],
          ].map(([label, value, tone]) => (
            <div key={label as string}>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                {label}
              </dt>
              <dd className={`font-cond mt-1 text-4xl font-semibold tabular-nums ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Contas">
        {linhas.length === 0 ? (
          <Empty>Nenhuma conta disponível para exibir.</Empty>
        ) : (
          <Table
            head={[
              'Conta',
              'Situação',
              'Conexão',
              'Hoje / teto',
              'Fila',
              'Erro 1h',
              'p95 latência',
              'Pausado até',
              'Rate limit',
            ]}
          >
            {linhas.map((linha) => (
              <tr key={linha.ad_account_id} className={linha.alertas.length > 0 ? 'bg-[var(--color-surface-2)]' : ''}>
                <td className="px-3 py-2">
                  <p className="font-medium">{linha.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{linha.ad_account_id}</p>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {linha.alertas.length === 0 ? <span className="live-dot" aria-hidden="true" /> : null}
                    <Badge tone={linha.alertas.length > 0 ? 'danger' : 'ok'}>
                      {linha.alertas.length > 0 ? 'Atenção' : 'Normal'}
                    </Badge>
                  </span>
                  {linha.alertas.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-[var(--color-danger)]">
                      {linha.alertas.map((alerta) => (
                        <li key={`${linha.ad_account_id}-${alerta}`}>{alerta}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {CONNECTION_LABELS[linha.connection_status] ?? linha.connection_status}
                </td>
                <td className="px-3 py-2">
                  {linha.published_today} / {linha.daily_cap}
                </td>
                <td className="px-3 py-2">{linha.pending_jobs}</td>
                <td
                  className={`px-3 py-2 ${
                    linha.error_rate_1h > ERROR_RATE_LIMIT ? 'text-[var(--color-danger)]' : ''
                  }`}
                >
                  {toPercent(linha.error_rate_1h)}
                </td>
                <td className="px-3 py-2">{linha.p95_latency_ms.toLocaleString('pt-BR')} ms</td>
                <td className="px-3 py-2">{formatDate(linha.paused_until)}</td>
                <td className="px-3 py-2 text-xs break-words">{formatRateUsage(linha.rate_usage)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
