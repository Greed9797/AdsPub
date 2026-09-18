import { requireRole } from '@/lib/session';
import { api } from '@/lib/api';
import { PageHead } from '@/components/ui';
import type { AdAccount, Asset, Client } from '@/lib/types';
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

  return (
    <div className="space-y-6">
      <PageHead title="Novo lote" description="Escolha cliente, conta e criativos para montar o lote." />
      <NewBatchForm
        clients={clients}
        accounts={accounts}
        assets={assets}
        clientId={clientId ?? ''}
        criarLoteAction={criarLote}
      />
    </div>
  );
}
