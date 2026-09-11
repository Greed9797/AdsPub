'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Card, Empty, Field, inputClass } from '@/components/ui';
import type { AdAccount, Asset, Client } from '@/lib/types';
import type { ActionResult } from '../actions';
import { Button } from '@astryxdesign/core/Button';

type NewBatchFormProps = {
  clients: Client[];
  accounts: AdAccount[];
  assets: Asset[];
  clientId: string;
  criarLoteAction: (formData: FormData) => Promise<ActionResult<{ id: string }>>;
};

export function NewBatchForm({ clients, accounts, assets, clientId, criarLoteAction }: NewBatchFormProps) {
  const router = useRouter();
  const [isSwitchingClient, startClientSwitch] = useTransition();
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    if (mode === 'ai' && selectedAssetIds.length === 0) {
      setErrorMessage('Selecione pelo menos um criativo para o planejamento por IA.');
      return;
    }

    setErrorMessage(undefined);
    setIsSubmitting(true);

    const result = await criarLoteAction(formData);

    // Sucesso redireciona no servidor; só voltamos aqui em caso de erro.
    setIsSubmitting(false);
    if ('erro' in result) {
      setErrorMessage(result.erro);
    }
  };

  if (clients.length === 0) {
    return (
      <Card title="Criar lote">
        <Empty title="Nenhum cliente cadastrado" hint="Cadastre um cliente antes de criar lotes." />
      </Card>
    );
  }

  return (
    <Card title="Criar lote">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Cliente">
            <select
              className={inputClass}
              name="client_id"
              value={clientId}
              disabled={isSwitchingClient}
              onChange={(event) => {
                const nextClientId = event.target.value;
                setSelectedAssetIds([]);
                startClientSwitch(() => {
                  router.replace(`/lotes/novo?client_id=${encodeURIComponent(nextClientId)}`);
                });
              }}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Conta de anúncios">
            <select className={inputClass} name="ad_account_id" required defaultValue={accounts[0]?.id ?? ''}>
              {accounts.length === 0 ? <option value="">Sem contas vinculadas a este cliente</option> : null}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Nome do lote">
          <input className={inputClass} name="name" required />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Modo">
            <select
              className={inputClass}
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value === 'manual' ? 'manual' : 'ai')}
            >
              <option value="ai">IA (gera o plano de anúncios)</option>
              <option value="manual">Manual (itens adicionados depois)</option>
            </select>
          </Field>

          <Field label="Cópias por criativo" hint="Entre 1 e 5. Usado apenas no modo IA.">
            <input
              className={inputClass}
              name="copies_per_creative"
              type="number"
              min={1}
              max={5}
              defaultValue={3}
              disabled={mode === 'manual'}
            />
          </Field>
        </div>

        <Field label="Briefing" hint={mode === 'ai' ? 'Obrigatório no modo IA.' : 'Opcional no modo manual.'}>
          <textarea className={`${inputClass} h-32`} name="briefing" required={mode === 'ai'} />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-muted)]">
              Criativos aprovados ({selectedAssetIds.length} selecionado(s))
            </span>
            {assets.length > 0 ? (
              <button
                type="button"
                className="text-xs text-[var(--color-brand)]"
                onClick={() =>
                  setSelectedAssetIds((previous) =>
                    previous.length === assets.length ? [] : assets.map((asset) => asset.id),
                  )
                }
              >
                {selectedAssetIds.length === assets.length ? 'Limpar seleção' : 'Selecionar todos'}
              </button>
            ) : null}
          </div>

          {assets.length === 0 ? (
            <Empty title="Nenhum criativo aprovado" hint="Aprove criativos para este cliente para montar o lote." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => (
                <label
                  key={asset.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3"
                >
                  <input
                    type="checkbox"
                    name="asset_ids"
                    value={asset.id}
                    checked={selectedAssetIds.includes(asset.id)}
                    onChange={(event) =>
                      setSelectedAssetIds((previous) =>
                        event.target.checked
                          ? [...previous, asset.id]
                          : previous.filter((id) => id !== asset.id),
                      )
                    }
                  />
                  {asset.thumbnail_url ? (
                    <img src={asset.thumbnail_url} alt={asset.filename} className="h-12 w-12 rounded object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-sm" title={asset.filename}>
                    {asset.filename}
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">{asset.aspect_ratio}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {errorMessage ? <p className="text-sm text-[var(--color-danger)]">{errorMessage}</p> : null}

        <div className="flex gap-2">
          <Button variant="primary" label={isSubmitting ? 'Criando...' : 'Criar lote'} type="submit" isDisabled={isSubmitting || isSwitchingClient || accounts.length === 0} />
          <Button variant="secondary" label="Limpar seleção" isDisabled={isSubmitting} onClick={() => {
              setSelectedAssetIds([]);
              setMode('ai');
              setErrorMessage(undefined);
            }} />
        </div>
      </form>
    </Card>
  );
}
