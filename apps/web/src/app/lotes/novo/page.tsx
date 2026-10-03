import { requireRole } from '@/lib/session';
import { api } from '@/lib/api';
import { PageHead } from '@/components/ui';
import type { AccountHealth, AdAccount, Asset, Client } from '@/lib/types';
import { NewBatchForm } from './new-batch-form';
import { criarLote } from '../actions';

export default async function NovoLotePage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string | string[] }>;
}) {
  await requireRole(['admin', 'coordinator', 'manager']);

  const query = await searchParams;
  const rawClientId = Array.isArray(query.client_id) ? query.client_id[0] : query.client_id;

  const clients = await api<Client[]>('/clients');
  const clientId = clients.some((client) => client.id === rawClientId) ? rawClientId : clients[0]?.id;

  let accounts: AdAccount[] = [];
  let assets: Asset[] = [];

  if (clientId) {
    [accounts, assets] = await Promise.all([
      api<AdAccount[]>(`/ad-accounts?client_id=${encodeURIComponent(clientId)}`),
      api<Asset[]>(`/assets?client_id=${encodeURIComponent(clientId)}&status=ok`),
    ]);
  }

  // Saldo diário por conta: só enfeita o resumo, então falha de uma conta não derruba a tela.
  const saldos: Record<string, number> = {};
  await Promise.all(
    accounts.map(async (account) => {
      const health = await api<AccountHealth>(`/ad-accounts/${encodeURIComponent(account.id)}/health`).catch(() => undefined);
      if (health) saldos[account.id] = Math.max(0, health.daily_cap - health.published_today);
    }),
  );

  return (
    <div className="ap-lotes">
      <PageHead title="Novo lote" description="Escolha cliente, conta e criativos. A IA monta os anúncios; você revisa tudo antes de qualquer verba ser usada." />
      <NewBatchForm
        clients={clients}
        accounts={accounts}
        assets={assets}
        clientId={clientId ?? ''}
        saldos={saldos}
        criarLoteAction={criarLote}
      />
    </div>
  );
}
