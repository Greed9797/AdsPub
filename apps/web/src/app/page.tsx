import Link from 'next/link';

import { Badge, Card, Table, buttonClass, Empty } from '@/components/ui';
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

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Lotes</h1>
        <Link href="/lotes/novo" className={buttonClass}>
          Novo lote
        </Link>
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-text)]">
          {errorMessage}
        </p>
      ) : null}

      <Card title="Filtros">
        <form className="flex flex-wrap gap-3" method="get">
          <label className="min-w-64">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Conta</span>
            <select
              name="ad_account_id"
              defaultValue={accountId ?? ''}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            >
              <option value="">Todas as contas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-52">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Status</span>
            <select
              name="status"
              defaultValue={status ?? ''}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {BATCH_STATUSES.map((batchStatus) => (
                <option key={batchStatus} value={batchStatus}>
                  {batchStatus}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className={buttonClass}>
            Aplicar
          </button>
        </form>
      </Card>

      <Card title="Últimos lotes">
        {batches.length === 0 ? (
          <Empty>Nenhum lote encontrado.</Empty>
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
                <tr key={batch.id} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2">{batch.name}</td>
                  <td className="px-3 py-2">{getAccountName(batch.ad_account_id)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={statusTone(batch.status)}>{batch.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-center">{batch.items.length}</td>
                  <td className="px-3 py-2">{updatedAt.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2">
                    <Link href={`/lotes/${batch.id}`} className="text-sm text-[var(--color-brand)]">
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
