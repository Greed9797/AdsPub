import { notFound } from 'next/navigation';
import { z } from 'zod';

import { Button, Card, Empty, PageHead, Selo } from '@/components/ui';
import { requireSession } from '@/lib/session';
import { ApiError, api } from '@/lib/api';
import type { AccountHealth, AdAccount, AdsetRef, Asset, Batch, CampaignRef } from '@/lib/types';
import { ProgressStream } from './progress-stream';
import { BatchItemsTable } from './batch-items-table';
import { ManualBuilder } from './manual-builder';
import { PublishPanel } from './publish-panel';
import { ReconciliationPanel } from './reconciliation-panel';
import { SharedStructure } from './shared-structure';
import {
  duplicarLote,
  publicarLote,
  removerItem,
  reprocessarItem,
  resolverItem,
  resolverRef,
  salvarItem,
  salvarPlanoManual,
  validarLote,
} from '../actions';

export default async function LotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string | string[] }>;
}) {
  const user = await requireSession();
  const canEdit = user.role !== 'viewer';

  const [{ id }, query] = await Promise.all([params, searchParams]);

  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }

  const errorMessage = Array.isArray(query.erro) ? query.erro[0] : query.erro;

  const batch = await api<Batch>(`/batches/${id}`).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const [account, clientAccounts, assets, health] = await Promise.all([
    api<AdAccount>(`/ad-accounts/${batch.ad_account_id}`),
    api<AdAccount[]>(`/ad-accounts?client_id=${encodeURIComponent(batch.client_id)}`),
    api<Asset[]>(`/assets?client_id=${encodeURIComponent(batch.client_id)}&status=ok`),
    // O saldo diário só enfeita a revisão final; a API aplica o teto de qualquer jeito.
    api<AccountHealth>(`/ad-accounts/${encodeURIComponent(batch.ad_account_id)}/health`).catch(() => undefined),
  ]);
  const dailyRemaining = health ? Math.max(0, health.daily_cap - health.published_today) : undefined;

  // Modo manual: o construtor precisa dos criativos aprovados e do cache de campanhas/conjuntos.
  let campaigns: CampaignRef[] = [];
  let adsets: AdsetRef[] = [];

  if (batch.mode === 'manual') {
    [campaigns, adsets] = await Promise.all([
      api<CampaignRef[]>(`/ad-accounts/${encodeURIComponent(batch.ad_account_id)}/campaigns`),
      api<AdsetRef[]>(`/ad-accounts/${encodeURIComponent(batch.ad_account_id)}/adsets`),
    ]);
  }

  return (
    <div className="ap-lotes">
      <PageHead
        title={batch.name}
        description={`${account.name} · ${batch.mode === 'ai' ? 'Planejamento com IA' : 'Criação manual'}`}
        action={
          <>
            <Selo status={batch.status} />
            <Button variant="secondary" label="Voltar aos lotes" href="/" />
          </>
        }
      />
      {errorMessage ? (
        <p role="alert" className="notice notice-error">
          {errorMessage}
        </p>
      ) : null}
      {batch.pending.length > 0 ? (
        <p role="status" className="notice notice-warning">
          Pendências do plano: {batch.pending.join(', ')}
        </p>
      ) : null}

      <div className="review-layout">
        <div className="review-main">
          <Card>
            <details>
              <summary className="text-sm font-semibold">Detalhes e orientações do lote</summary>
              <dl className="summary-list mt-4 sm:grid-cols-2">
                <div>
                  <dt>Conta de anúncios</dt>
                  <dd>{account.name}</dd>
                </div>
                <div>
                  <dt>Última atualização</dt>
                  <dd>{new Date(batch.updated_at).toLocaleString('pt-BR')}</dd>
                </div>
                <div>
                  <dt>Pendências</dt>
                  <dd className={batch.pending.length ? 'text-[var(--color-warn)]' : ''}>
                    {batch.pending.join(', ') || 'Sem pendências'}
                  </dd>
                </div>
                <div>
                  <dt>Observações do plano</dt>
                  <dd>{batch.plan_notes || 'Sem observações'}</dd>
                </div>
              </dl>
            </details>
          </Card>
          <ProgressStream
            items={batch.items.map((item) => ({ id: item.id, status: item.status }))}
          />
          {canEdit ? (
            <ReconciliationPanel
              batchId={batch.id}
              items={batch.items}
              refs={batch.refs ?? []}
              resolverItemAction={resolverItem}
              resolverRefAction={resolverRef}
            />
          ) : null}
          {batch.items.length === 0 ? (
            <Card title="Anúncios do lote">
              <Empty
                title="Lote sem itens"
                hint={
                  batch.mode === 'manual'
                    ? 'Use o construtor abaixo para escolher o destino, selecionar mídias e montar os anúncios.'
                    : 'O plano ainda não tem anúncios. Confira as pendências nos detalhes do lote.'
                }
              />
            </Card>
          ) : (
            <BatchItemsTable
              batchId={batch.id}
              items={batch.items}
              assets={assets}
              canEdit={canEdit}
              salvarItemAction={salvarItem}
              removerItemAction={removerItem}
              reprocessarItemAction={reprocessarItem}
            />
          )}
          <SharedStructure batch={batch} />
          {batch.mode === 'manual' && canEdit ? (
            <details open={batch.items.length === 0} className="min-w-0">
              <summary className="mb-3 text-sm font-semibold">
                {batch.items.length ? 'Reabrir construtor manual' : 'Montar anúncios'}
              </summary>
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
            </details>
          ) : null}
        </div>
        <aside className="editor-aside" aria-label="Publicação do lote">
          <PublishPanel
            batchId={batch.id}
            batchName={batch.name}
            dailyRemaining={dailyRemaining}
            items={batch.items}
            accounts={clientAccounts}
            currentAccountId={batch.ad_account_id}
            approval={batch.approval ?? { approved: false, validated_at: null }}
            canEdit={canEdit}
            validarLoteAction={validarLote}
            publicarLoteAction={publicarLote}
            duplicarLoteAction={duplicarLote}
          />
        </aside>
      </div>
    </div>
  );
}
