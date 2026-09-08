import { requireSession } from '@/lib/session';
import { api } from '@/lib/api';
import type { AdAccount, Asset, Client } from '@/lib/types';
import { NewBatchForm } from './new-batch-form';
import { criarLote } from '../actions';

export default async function NovoLotePage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string | string[] }>;
}) {
  await requireSession();

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
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo lote</h1>
      <NewBatchForm
        clients={clients}
        accounts={accounts}
        assets={assets}
        clientId={clientId ?? ''}
        criarLoteAction={criarLote}
      />
    </main>
  );
}
