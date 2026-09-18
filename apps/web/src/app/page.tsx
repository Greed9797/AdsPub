import Link from 'next/link';

import {
  Badge,
  Card,
  Empty,
  Field,
  PageHead,
  Table,
  inputClass,
  statusLabel,
  formatLabel,
  plural,
} from '@/components/ui';
import { Icon } from '@/components/icons';
import { requireSession } from '@/lib/session';
import { api } from '@/lib/api';
import type { AdAccount, Batch, BatchStatus } from '@/lib/types';
import { batchStatusSchema } from '@adpub/shared';
import { Button } from '@astryxdesign/core/Button';
import { ButtonLink } from '@/components/button-link';
import { TableCell, TableRow } from '@astryxdesign/core/Table';

type HomeSearchParams = {
  ad_account_id?: string | string[];
  status?: string | string[];
  erro?: string | string[];
  q?: string | string[];
  view?: string | string[];
};

const BATCH_STATUSES: BatchStatus[] = [
  'draft',
  'ready',
  'blocked',
  'queued',
  'publishing',
  'done',
  'partial',
  'failed',
  'archived',
];

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function statusTone(status: string): 'ok' | 'warn' | 'danger' | 'info' {
  if (['done', 'approved', 'ready', 'published'].includes(status)) return 'ok';
  if (['partial', 'failed', 'blocked', 'disapproved'].includes(status)) return 'danger';
  if (status === 'publishing' || status === 'queued') return 'warn';
  return 'info';
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  const user = await requireSession();
  const canEdit = user.role !== 'viewer';
  const params = await searchParams;

  const rawStatus = pickFirst(params.status);
  const rawAccount = pickFirst(params.ad_account_id);
  const errorMessage = pickFirst(params.erro);

  // Id de conta da Meta é `act_<numero>`: qualquer string não vazia é candidata válida.
  const accountId = rawAccount?.trim() ? rawAccount.trim() : undefined;
  const status = batchStatusSchema.safeParse(rawStatus).success ? rawStatus : undefined;

  const filters = new URLSearchParams();
  if (accountId) filters.set('ad_account_id', accountId);
  if (status) filters.set('status', status);

  const batchPath = filters.size > 0 ? `/batches?${filters.toString()}` : '/batches';

  const [accounts, batches] = await Promise.all([
    api<AdAccount[]>('/ad-accounts'),
    api<Batch[]>(batchPath),
  ]);

  const accountMap = new Map(accounts.map((account) => [account.id, account.name]));

  const getAccountName = (accountIdValue: string) =>
    accountMap.get(accountIdValue) ?? 'Conta desconhecida';

  const search = pickFirst(params.q)?.trim() ?? '';
  const adsView = pickFirst(params.view) === 'ads';
  const needle = search.toLocaleLowerCase('pt-BR');
  const visibleBatches = batches.filter(
    (batch) =>
      !needle ||
      [
        batch.name,
        getAccountName(batch.ad_account_id),
        ...batch.items.map((item) => item.name),
      ].some((value) => value.toLocaleLowerCase('pt-BR').includes(needle)),
  );
  const ads = visibleBatches.flatMap((batch) =>
    batch.items
      .filter(
        (item) =>
          !adsView ||
          !needle ||
          [item.name, batch.name, getAccountName(batch.ad_account_id)].some((value) =>
            value.toLocaleLowerCase('pt-BR').includes(needle),
          ),
      )
      .map((item) => ({ item, batch })),
  );
  const activeCount = visibleBatches.filter((batch) =>
    ['queued', 'publishing'].includes(batch.status),
  ).length;
  const attentionCount = visibleBatches.filter((batch) =>
    ['failed', 'partial', 'blocked'].includes(batch.status),
  ).length;

  function viewHref(view: 'batches' | 'ads') {
    const query = new URLSearchParams(filters);
    if (search) query.set('q', search);
    if (view === 'ads') query.set('view', 'ads');
    return query.size ? `/?${query}` : '/';
  }

  return (
    <div className="space-y-5">
      <PageHead
        title="Anúncios"
        description="Organize seus lotes, revise os anúncios e acompanhe a publicação."
        action={canEdit ? <ButtonLink variant="primary" label="Novo lote" href="/lotes/novo" /> : undefined}
      />

      {errorMessage ? (
        <p role="alert" className="notice notice-error">
          {errorMessage}
        </p>
      ) : null}

      <form method="get" aria-label="Filtrar lotes" className="toolbar">
        {adsView ? <input type="hidden" name="view" value="ads" /> : null}
        <div className="search-field">
          <Field label="Pesquisar">
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Buscar por nome do lote ou anúncio"
              className={inputClass}
            />
          </Field>
          <Icon name="search" />
        </div>
        <Field label="Conta" className="w-full sm:w-56">
          <select name="ad_account_id" defaultValue={accountId ?? ''} className={inputClass}>
            <option value="">Todas as contas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status do lote" className="w-full sm:w-44">
          <select name="status" defaultValue={status ?? ''} className={inputClass}>
            <option value="">Todos os status</option>
            {BATCH_STATUSES.map((batchStatus) => (
              <option key={batchStatus} value={batchStatus}>
                {statusLabel(batchStatus)}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="secondary" label="Aplicar" type="submit" />
        {filters.size > 0 || search ? (
          <Link
            href={adsView ? '/?view=ads' : '/'}
            className="py-2 text-sm text-[var(--color-brand)]"
          >
            Limpar filtros
          </Link>
        ) : null}
      </form>

      <div className="workspace-summary" aria-label="Resumo dos lotes filtrados">
        <span>
          <strong>{visibleBatches.length}</strong> lotes no recorte
        </span>
        <span>
          <strong>{ads.length}</strong> anúncios
        </span>
        <span>
          <strong>{activeCount}</strong> lotes em publicação
        </span>
        <span>
          <strong>{attentionCount}</strong> precisam de atenção
        </span>
      </div>

      <div>
        <nav className="workspace-tabs" aria-label="Visualização dos anúncios">
          <Link
            className="workspace-tab"
            href={viewHref('batches')}
            aria-current={!adsView ? 'page' : undefined}
          >
            <Icon name="folder" /> Lotes
          </Link>
          <Link
            className="workspace-tab"
            href={viewHref('ads')}
            aria-current={adsView ? 'page' : undefined}
          >
            <Icon name="ad" /> Anúncios
          </Link>
          <Link
            className="workspace-tab"
            href={
              accountId
                ? `/performance?ad_account_id=${encodeURIComponent(accountId)}`
                : '/performance'
            }
          >
            <Icon name="chart" /> Desempenho
          </Link>
        </nav>
        <Card
          title={adsView ? 'Anúncios dos lotes' : 'Lotes de anúncios'}
          action={
            <span className="text-xs text-[var(--color-muted)]">
              {plural(adsView ? ads.length : visibleBatches.length, 'resultado', 'resultados')}
            </span>
          }
        >
          {(adsView ? ads.length === 0 : visibleBatches.length === 0) ? (
            <Empty
              title={adsView ? 'Nenhum anúncio neste recorte' : 'Nenhum lote encontrado'}
              hint={
                adsView
                  ? 'Os anúncios aparecem aqui depois de montar um lote. Abra um lote ou comece um novo.'
                  : 'Ajuste a busca e os filtros, ou crie um lote para começar.'
              }
              action={canEdit ? <ButtonLink variant="primary" label="Novo lote" href="/lotes/novo" /> : undefined}
            />
          ) : adsView ? (
            <Table head={['Anúncio', 'Lote', 'Formato', 'Status', 'Destino']}>
              {ads.map(({ item, batch }) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link className="row-name" href={`/lotes/${batch.id}`}>
                      {item.name}
                    </Link>
                    <p className="row-detail">{getAccountName(batch.ad_account_id)}</p>
                  </TableCell>
                  <TableCell>{batch.name}</TableCell>
                  <TableCell>{formatLabel(item.format)}</TableCell>
                  <TableCell>
                    <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    {item.ads_manager_url ? (
                      <a
                        href={item.ads_manager_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-brand)]"
                      >
                        Ver na Meta
                      </a>
                    ) : (
                      <Link href={`/lotes/${batch.id}`} className="text-[var(--color-brand)]">
                        Revisar anúncio
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          ) : (
            <Table
              head={[
                'Nome do lote',
                'Status',
                'Conta de anúncios',
                'Anúncios',
                'Última alteração',
                '',
              ]}
            >
              {visibleBatches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <Link href={`/lotes/${batch.id}`} className="row-name">
                      {batch.name}
                    </Link>
                    <p className="row-detail">
                      {batch.mode === 'ai' ? 'Planejamento com IA' : 'Criação manual'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge tone={statusTone(batch.status)}>{statusLabel(batch.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-[var(--color-muted)]">
                    {getAccountName(batch.ad_account_id)}
                  </TableCell>
                  <TableCell className="numeric">{batch.items.length}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-[var(--color-muted)]">
                    {new Date(batch.updated_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/lotes/${batch.id}`}
                      className="whitespace-nowrap text-[var(--color-brand)]"
                    >
                      Abrir lote
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
