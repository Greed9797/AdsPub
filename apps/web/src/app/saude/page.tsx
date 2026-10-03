import { Callout, Card, Empty, PageHead, Selo, Table, TableCell, TableRow, plural } from '@/components/ui';
import { api } from '@/lib/api';
import {
  CONNECTION_LABELS,
  ERROR_RATE_LIMIT,
  descreverRateUsage,
  formatarData,
  formatarPercentual,
  linhasDeSaude,
  resumoDeSaude,
} from '@/lib/saude-view';
import { requireSession } from '@/lib/session';
import type { AccountHealth } from '@/lib/types';

export default async function SaudePage() {
  await requireSession();

  const rows = await api<AccountHealth[]>('/health/accounts');
  const linhas = linhasDeSaude(rows);
  const resumo = resumoDeSaude(linhas);
  const primeira = linhas.find((linha) => linha.alertas.length > 0);

  const cartoes: Array<{ rotulo: string; valor: string; alerta?: boolean }> = [
    { rotulo: 'Contas', valor: String(resumo.contas) },
    { rotulo: 'Em atenção', valor: String(resumo.emAtencao), alerta: resumo.emAtencao > 0 },
    { rotulo: 'Erro médio 1h', valor: formatarPercentual(resumo.erroMedio), alerta: resumo.erroMedio > ERROR_RATE_LIMIT },
    { rotulo: 'No teto diário', valor: String(resumo.noTeto), alerta: resumo.noTeto > 0 },
  ];

  return (
    <div className="ap-lotes">
      <PageHead
        title="Saúde das contas"
        description="Situação de cada conta: fila, erros e limite diário."
        action={
          <Selo
            tone={resumo.emAtencao === 0 ? 'publicado' : 'bloqueado'}
            label={
              resumo.emAtencao === 0
                ? plural(linhas.length, 'conta sem alerta', 'contas sem alerta')
                : `${resumo.emAtencao} de ${linhas.length} em atenção`
            }
          />
        }
      />

      {primeira ? (
        <Callout tone="danger" title={`${primeira.name} precisa de atenção`}>
          <ul className="ap-saude__alertas">
            {primeira.alertas.map((alerta) => (
              <li key={alerta}>{alerta}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <section aria-label="Resumo" className="ap-saude__resumo">
        {cartoes.map((cartao) => (
          <Card key={cartao.rotulo} variant="stat">
            <p className="ap-t-label ap-saude__rotulo">{cartao.rotulo}</p>
            <p className="ap-t-num-l ap-saude__valor" data-alerta={cartao.alerta ? 'true' : undefined}>
              {cartao.valor}
            </p>
          </Card>
        ))}
      </section>

      <Card title="Contas">
        {linhas.length === 0 ? (
          <Empty title="Nenhuma conta disponível" />
        ) : (
          <Table
            head={['Conta', 'Situação', 'Conexão', 'Hoje / teto', 'Fila', 'Erro 1h', 'p95 latência', 'Pausado até', 'Rate limit']}
          >
            {linhas.map((linha) => (
              <TableRow key={linha.ad_account_id} className={linha.alertas.length > 0 ? 'ap-saude__atencao' : undefined}>
                <TableCell>
                  <p className="ap-t-body-strong ap-saude__p">{linha.name}</p>
                  <p className="ap-t-ref ap-saude__id ap-saude__p">{linha.ad_account_id}</p>
                </TableCell>
                <TableCell>
                  <Selo tone={linha.alertas.length > 0 ? 'bloqueado' : 'publicado'} label={linha.alertas.length > 0 ? 'Atenção' : 'Normal'} />
                  {linha.alertas.length > 0 ? (
                    <ul className="ap-saude__alertas ap-t-small">
                      {linha.alertas.map((alerta) => (
                        <li key={`${linha.ad_account_id}-${alerta}`}>{alerta}</li>
                      ))}
                    </ul>
                  ) : null}
                </TableCell>
                <TableCell>{CONNECTION_LABELS[linha.connection_status] ?? linha.connection_status}</TableCell>
                <TableCell className="numeric">
                  {linha.published_today} / {linha.daily_cap}
                </TableCell>
                <TableCell className="numeric">{linha.pending_jobs}</TableCell>
                <TableCell className={linha.error_rate_1h > ERROR_RATE_LIMIT ? 'numeric ap-saude__erro' : 'numeric'}>
                  {formatarPercentual(linha.error_rate_1h)}
                </TableCell>
                <TableCell className="numeric">{linha.p95_latency_ms.toLocaleString('pt-BR')} ms</TableCell>
                <TableCell>{formatarData(linha.paused_until)}</TableCell>
                <TableCell className="ap-t-small">{descreverRateUsage(linha.rate_usage)}</TableCell>
              </TableRow>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
