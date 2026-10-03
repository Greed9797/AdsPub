import Link from 'next/link';

import { PipelineBar } from '@/components/lotes/pipeline-bar';
import { StateBoard } from '@/components/lotes/state-board';
import {
  Button,
  Chip,
  Empty,
  Field,
  PageHead,
  Selo,
  Table,
  TableCell,
  TableRow,
  inputClass,
  statusLabel,
  formatLabel,
} from '@/components/ui';
import { Icon } from '@/components/icons';
import {
  ESTADOS,
  contarLotes,
  contarPorGrupo,
  filaDePublicacao,
  filtrarLotes,
  precisamAtencao,
  type FiltroLista,
} from '@/lib/lotes-view';
import { requireSession } from '@/lib/session';
import { api } from '@/lib/api';
import type { AdAccount, Batch, BatchStatus } from '@/lib/types';
import { batchStatusSchema } from '@adpub/shared';

type HomeSearchParams = {
  ad_account_id?: string | string[];
  status?: string | string[];
  erro?: string | string[];
  q?: string | string[];
  view?: string | string[];
  estado?: string | string[];
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

function lerFiltro(valor: string | undefined): FiltroLista {
  if (valor === 'atencao') return 'atencao';
  return (ESTADOS as readonly string[]).includes(valor ?? '') ? (valor as FiltroLista) : 'todos';
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
  const filtro = lerFiltro(pickFirst(params.estado));
  const contagem = contarPorGrupo(visibleBatches);
  const totalAnuncios = visibleBatches.reduce((soma, batch) => soma + batch.items.length, 0);
  const listados = filtrarLotes(visibleBatches, filtro);
  const fila = filaDePublicacao(visibleBatches);
  const ads = listados.flatMap((batch) =>
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

  function href(view: 'batches' | 'ads', estado: FiltroLista = 'todos') {
    const query = new URLSearchParams(filters);
    if (search) query.set('q', search);
    if (view === 'ads') query.set('view', 'ads');
    if (estado !== 'todos') query.set('estado', estado);
    return query.size ? `/?${query}` : '/';
  }
  const hrefDoFiltro = (alvo: FiltroLista) => href(adsView ? 'ads' : 'batches', alvo);

  const novoLote = canEdit ? <Button variant="primary" label="Novo lote" href="/lotes/novo" /> : undefined;
  const filtrando = filters.size > 0 || search !== '' || filtro !== 'todos';

  return (
    <div className="ap-lotes">
      <PageHead
        title="Lotes"
        description="Organize seus lotes, revise os anúncios e acompanhe a publicação."
        action={novoLote}
      />

      {errorMessage ? (
        <p role="alert" className="notice notice-error">
          {errorMessage}
        </p>
      ) : null}

      <StateBoard
        contagem={contagem}
        total={totalAnuncios}
        atencao={precisamAtencao(contagem)}
        filtro={filtro}
        hrefDoFiltro={hrefDoFiltro}
      />

      {fila.length > 0 ? (
        <section className="ap-fila" aria-label="Fila de publicação">
          <p className="ap-t-body-strong">
            {fila.length} {fila.length === 1 ? 'lote pronto' : 'lotes prontos'} para publicar
          </p>
          {canEdit ? (
            <Button variant="primary" label="Revisar e publicar" href={`/lotes/${fila[0]!.id}`} />
          ) : null}
        </section>
      ) : null}

      <form method="get" aria-label="Filtrar lotes" className="ap-lotes__filters">
        {adsView ? <input type="hidden" name="view" value="ads" /> : null}
        {filtro !== 'todos' ? <input type="hidden" name="estado" value={filtro} /> : null}
        <Field label="Pesquisar" className="ap-lotes__search">
          <input
            id="ads-search"
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Nome do lote ou anúncio"
            className={inputClass}
          />
        </Field>
        <Field label="Conta">
          <select id="filtro-conta" name="ad_account_id" defaultValue={accountId ?? ''} className={inputClass}>
            <option value="">Todas as contas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status do lote">
          <select id="filtro-status" name="status" defaultValue={status ?? ''} className={inputClass}>
            <option value="">Todos os status</option>
            {BATCH_STATUSES.map((batchStatus) => (
              <option key={batchStatus} value={batchStatus}>
                {statusLabel(batchStatus)}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="secondary" label="Aplicar" type="submit" />
        {filtrando ? (
          <Button variant="ghost" label="Limpar filtros" href={adsView ? '/?view=ads' : '/'} />
        ) : null}
      </form>

      <div className="ap-chips" role="group" aria-label="Filtro por estado">
        <Chip href={href(adsView ? 'ads' : 'batches')} active={filtro === 'todos'} count={visibleBatches.length}>
          Todos
        </Chip>
        <Chip
          href={hrefDoFiltro('atencao')}
          active={filtro === 'atencao'}
          count={contarLotes(visibleBatches, 'atencao')}
        >
          Precisam de atenção
        </Chip>
        <Chip href={href('batches', filtro)} active={!adsView}>
          <Icon name="folder" /> Lotes
        </Chip>
        <Chip href={href('ads', filtro)} active={adsView}>
          <Icon name="ad" /> Anúncios
        </Chip>
        <Chip
          href={
            accountId ? `/performance?ad_account_id=${encodeURIComponent(accountId)}` : '/performance'
          }
        >
          <Icon name="chart" /> Desempenho
        </Chip>
      </div>

      {(adsView ? ads.length === 0 : listados.length === 0) ? (
        <Empty
          title={adsView ? 'Nenhum anúncio neste recorte' : 'Nenhum lote encontrado'}
          hint={
            adsView
              ? 'Os anúncios aparecem aqui depois de montar um lote. Abra um lote ou comece um novo.'
              : 'Ajuste a busca e os filtros, ou crie um lote para começar.'
          }
          action={novoLote}
        />
      ) : adsView ? (
        <Table head={['Anúncio', 'Lote', 'Formato', 'Estado', 'Destino']}>
          {ads.map(({ item, batch }) => (
            <TableRow key={item.id}>
              <TableCell>
                <Link className="ap-lotes__name" href={`/lotes/${batch.id}`}>
                  {item.name}
                </Link>
                <p className="ap-lotes__detail ap-t-small">{getAccountName(batch.ad_account_id)}</p>
              </TableCell>
              <TableCell>{batch.name}</TableCell>
              <TableCell>{formatLabel(item.format)}</TableCell>
              <TableCell>
                <Selo status={item.status} />
              </TableCell>
              <TableCell>
                {item.ads_manager_url ? (
                  <a href={item.ads_manager_url} target="_blank" rel="noreferrer">
                    Ver na Meta
                  </a>
                ) : (
                  <Link href={`/lotes/${batch.id}`}>Revisar anúncio</Link>
                )}
              </TableCell>
            </TableRow>
          ))}
        </Table>
      ) : (
        <>
          <div className="ap-lotes__table">
        <Table head={['Lote', 'Estado', 'Conta de anúncios', 'Pipeline', 'Anúncios', 'Última alteração', '']}>
          {listados.map((batch) => (
            <TableRow key={batch.id}>
              <TableCell>
                <Link href={`/lotes/${batch.id}`} className="ap-lotes__name">
                  {batch.name}
                </Link>
                <p className="ap-lotes__detail ap-t-small">
                  {batch.mode === 'ai' ? 'Planejamento com IA' : 'Criação manual'}
                </p>
              </TableCell>
              <TableCell>
                <Selo status={batch.status} />
              </TableCell>
              <TableCell>{getAccountName(batch.ad_account_id)}</TableCell>
              <TableCell>
                <PipelineBar batch={batch} />
              </TableCell>
              <TableCell className="numeric">{batch.items.length}</TableCell>
              <TableCell className="numeric">
                {new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date(batch.updated_at))}
              </TableCell>
              <TableCell>
                <Link href={`/lotes/${batch.id}`}>Abrir lote</Link>
              </TableCell>
            </TableRow>
          ))}
        </Table>
          </div>
          <ul className="ap-lotes__cards" aria-label="Lotes">
            {listados.map((batch) => {
              const naFila = fila.some((f) => f.id === batch.id);
              const alerta = contarPorGrupo([batch]);
              const pedem = precisamAtencao(alerta);
              return (
                <li key={batch.id} className="ap-lote-card" data-fila={naFila ? 'true' : undefined}>
                  <Link href={`/lotes/${batch.id}`} className="ap-lote-card__link">
                    <span className="ap-t-ref ap-lote-card__mode">
                      {batch.mode === 'ai' ? 'Plano com IA' : 'Criação manual'}
                    </span>
                    <span className="ap-t-block ap-lote-card__name">{batch.name}</span>
                    <span className="ap-t-small ap-lote-card__meta">
                      {getAccountName(batch.ad_account_id)} · {batch.items.length}{' '}
                      {batch.items.length === 1 ? 'anúncio' : 'anúncios'}
                    </span>
                    <PipelineBar batch={batch} />
                    {pedem > 0 ? (
                      <span className="ap-t-small ap-lote-card__alert">
                        {pedem} {pedem === 1 ? 'precisa de atenção' : 'precisam de atenção'}
                      </span>
                    ) : null}
                    <span className="ap-lote-card__foot">
                      <Selo status={batch.status} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
