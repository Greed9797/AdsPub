import { notFound } from 'next/navigation';
import { z } from 'zod';

import { Badge, Card, Empty, statusLabel } from '@/components/ui';
import { requireSession } from '@/lib/session';
import { api } from '@/lib/api';
import type { AdAccount, AdsetRef, Asset, Batch, CampaignRef } from '@/lib/types';
import { ProgressStream } from './progress-stream';
import { BatchItemsTable } from './batch-items-table';
import { ManualBuilder } from './manual-builder';
import { PublishPanel } from './publish-panel';
import {
  duplicarLote,
  publicarLote,
  removerItem,
  reprocessarItem,
  salvarItem,
  salvarPlanoManual,
  validarLote,
} from '../actions';

function statusTone(status: string): 'ok' | 'warn' | 'danger' | 'info' {
  if (status === 'done') return 'ok';
  if (status === 'partial' || status === 'failed' || status === 'blocked') return 'danger';
  if (status === 'publishing' || status === 'queued') return 'warn';
  return 'info';
}

export default async function LotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string | string[] }>;
}) {
  await requireSession();

  const [{ id }, query] = await Promise.all([params, searchParams]);

  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }

  const errorMessage = Array.isArray(query.erro) ? query.erro[0] : query.erro;

  const batch = await api<Batch>(`/batches/${id}`);
  const [account, clientAccounts] = await Promise.all([
    api<AdAccount>(`/ad-accounts/${batch.ad_account_id}`),
    api<AdAccount[]>(`/ad-accounts?client_id=${encodeURIComponent(batch.client_id)}`),
  ]);

  // Modo manual: o construtor precisa dos criativos aprovados e do cache de campanhas/conjuntos.
  let assets: Asset[] = [];
  let campaigns: CampaignRef[] = [];
  let adsets: AdsetRef[] = [];

  if (batch.mode === 'manual') {
    [assets, campaigns, adsets] = await Promise.all([
      api<Asset[]>(`/assets?client_id=${encodeURIComponent(batch.client_id)}&status=ok`),
      api<CampaignRef[]>(`/ad-accounts/${encodeURIComponent(batch.ad_account_id)}/campaigns`),
      api<AdsetRef[]>(`/ad-accounts/${encodeURIComponent(batch.ad_account_id)}/adsets`),
    ]);
  }

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <p className="rounded-lg border border-[var(--color-danger)] p-3 text-sm text-[var(--color-danger)]">
          {errorMessage}
        </p>
      ) : null}

      <Card title={batch.name}>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p>
            Conta: <span className="text-[var(--color-muted)]">{account.name}</span>
          </p>
          <p>
            Status: <Badge tone={statusTone(batch.status)}>{statusLabel(batch.status)}</Badge>
          </p>
          <p>
            Atualizado em:{' '}
            <span className="text-[var(--color-muted)]">{new Date(batch.updated_at).toLocaleString('pt-BR')}</span>
          </p>
          <p>
            Itens: <span className="text-[var(--color-muted)]">{batch.items.length}</span>
          </p>
          <p className="md:col-span-2">
            Pendências:{' '}
            {batch.pending.length > 0 ? (
              <span className="text-[var(--color-warn)]">{batch.pending.join(', ')}</span>
            ) : (
              <span className="text-[var(--color-muted)]">Sem pendências</span>
            )}
          </p>
          <p className="md:col-span-2">
            Observações do plano:{' '}
            <span className="text-[var(--color-muted)]">{batch.plan_notes || 'Sem observações'}</span>
          </p>
        </div>
      </Card>

      {batch.mode === 'manual' ? (
        <ManualBuilder
          batchId={batch.id}
          assets={assets}
          campaigns={campaigns}
          adsets={adsets}
          defaultPageId={account.default_page_id}
          defaultIgUserId={account.default_ig_user_id}
          hasItems={batch.items.length > 0}
          salvarPlanoManualAction={salvarPlanoManual}
        />
      ) : null}

      <ProgressStream items={batch.items.map((item) => ({ id: item.id, status: item.status }))} />

      <PublishPanel
        batchId={batch.id}
        items={batch.items}
        accounts={clientAccounts}
        currentAccountId={batch.ad_account_id}
        validarLoteAction={validarLote}
        publicarLoteAction={publicarLote}
        duplicarLoteAction={duplicarLote}
      />

      {batch.items.length === 0 ? (
        <Card title="Itens">
          <Empty title="Lote sem itens" hint="Monte os anúncios no construtor abaixo e valide antes de publicar." />
        </Card>
      ) : (
        <BatchItemsTable
          batchId={batch.id}
          items={batch.items}
          salvarItemAction={salvarItem}
          removerItemAction={removerItem}
          reprocessarItemAction={reprocessarItem}
        />
      )}
    </div>
  );
}
