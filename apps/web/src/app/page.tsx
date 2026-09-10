import Link from 'next/link';

import { Badge, Card, Empty, Field, PageHead, Table, buttonClass, inputClass } from '@/components/ui';
import { requireSession } from '@/lib/session';
import { api } from '@/lib/api';
import type { AdAccount, Batch, BatchStatus } from '@/lib/types';
import { batchStatusSchema } from '@adpub/shared';

type HomeSearchParams = {
  ad_account_id?: string | string[];
  status?: string | string[];
  erro?: string | string[];
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
  if (status === 'done' || status === 'approved') return 'ok';
  if (status === 'partial' || status === 'failed') return 'danger';
  if (status === 'publishing' || status === 'queued') return 'warn';
  return 'info';
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  await requireSession();
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

  const getAccountName = (accountIdValue: string) => accountMap.get(accountIdValue) ?? 'Conta desconhecida';

  // Faixa-resumo do recorte listado (sem filtro = global). Sem fetch extra.
  const ACTIVE = new Set(['queued', 'publishing']);
  const ATTENTION = new Set(['failed', 'partial', 'blocked']);
  const ativos = batches.filter((batch) => ACTIVE.has(batch.status)).length;
  const concluidos = batches.filter((batch) => batch.status === 'done').length;
  const atencao = batches.filter((batch) => ATTENTION.has(batch.status)).length;

  const BAR_TONE: Record<string, string> = {
    ok: 'bg-[var(--color-ok)]',
    warn: 'bg-[var(--color-warn)]',
    danger: 'bg-[var(--color-danger)]',
    info: 'bg-[var(--color-muted)]',
  };

  return (
    <main className="space-y-6">
      <PageHead
        title="Lotes"
        description="Monte, revise e publique anúncios Meta em lote."
        action={
          <Link href="/lotes/novo" className={buttonClass}>
            Novo lote
          </Link>
        }
      />

      {errorMessage ? (
        <p className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-text)]">
          {errorMessage}
        </p>
      ) : null}

      <Card title={filters.size > 0 ? 'Resumo do recorte' : 'Resumo'}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {[
            ['Lotes', batches.length, 'text-[var(--color-text)]'],
            ['Ativos', ativos, 'text-[var(--color-warn)]'],
            ['Concluídos', concluidos, 'text-[var(--color-ok)]'],
            ['Atenção', atencao, atencao > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]'],
          ].map(([label, value, tone]) => (
            <div key={label as string}>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                {label}
              </dt>
              <dd className={`mt-1 text-3xl font-semibold tabular-nums tracking-[-0.03em] ${tone}`}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {batches.length > 0 ? (
          <div
            className="mt-4 flex h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
            role="img"
            aria-label={`Distribuição: ${BATCH_STATUSES.map((s) => {
              const n = batches.filter((batch) => batch.status === s).length;
              return n > 0 ? `${n} ${s}` : null;
            })
              .filter(Boolean)
              .join(', ')}`}
          >
            {BATCH_STATUSES.map((s) => {
              const n = batches.filter((batch) => batch.status === s).length;
              if (n === 0) return null;
              return (
                <span
                  key={s}
                  style={{ width: `${(n / batches.length) * 100}%` }}
                  className={BAR_TONE[statusTone(s)]}
                />
              );
            })}
          </div>
        ) : null}
      </Card>

      <form
        method="get"
        aria-label="Filtrar lotes"
        className="flex flex-wrap items-end gap-x-3 gap-y-3 border-b border-[var(--color-border)] pb-5"
      >
        <Field label="Conta" className="w-full sm:w-64">
          <select name="ad_account_id" defaultValue={accountId ?? ''} className={inputClass}>
            <option value="">Todas as contas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status" className="w-full sm:w-52">
          <select name="status" defaultValue={status ?? ''} className={inputClass}>
            <option value="">Todos</option>
            {BATCH_STATUSES.map((batchStatus) => (
              <option key={batchStatus} value={batchStatus}>
                {batchStatus}
              </option>
            ))}
          </select>
        </Field>

        <button type="submit" className={buttonClass}>
          Aplicar
        </button>
      </form>

      <Card
        title="Últimos lotes"
        action={
          batches.length > 0 ? (
            <span className="text-xs tabular-nums text-[var(--color-muted)]">{batches.length}</span>
          ) : undefined
        }
      >
        {batches.length === 0 ? (
          <Empty
            title="Nenhum lote encontrado"
            hint="Ajuste os filtros ou crie o primeiro lote para começar a publicar."
            action={
              <Link href="/lotes/novo" className={buttonClass}>
                Novo lote
              </Link>
            }
          />
        ) : (
          <Table
            head={[
              'Nome',
              'Conta',
              'Status',
              'Itens',
              'Atualizado em',
              '',
            ]}
          >
            {batches.map((batch) => {
              const updatedAt = new Date(batch.updated_at);

              return (
                <tr key={batch.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-2.5 font-medium first:pl-0">{batch.name}</td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)]">{getAccountName(batch.ad_account_id)}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={statusTone(batch.status)}>{batch.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{batch.items.length}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[var(--color-muted)]">
                    {updatedAt.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 text-right last:pr-0">
                    <Link href={`/lotes/${batch.id}`} className="text-sm font-medium text-[var(--color-brand)]">
                      Abrir lote
                    </Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </main>
  );
}
