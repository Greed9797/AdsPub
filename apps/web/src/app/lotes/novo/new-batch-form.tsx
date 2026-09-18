'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Card, Empty, Field, inputClass, plural } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { AdAccount, Asset, Client } from '@/lib/types';
import type { ActionResult } from '../actions';
import { Button } from '@astryxdesign/core/Button';
import { ButtonLink } from '@/components/button-link';

type NewBatchFormProps = {
  clients: Client[];
  accounts: AdAccount[];
  assets: Asset[];
  clientId: string;
  criarLoteAction: (formData: FormData) => Promise<ActionResult<{ id: string }>>;
};

export function NewBatchForm({
  clients,
  accounts,
  assets,
  clientId,
  criarLoteAction,
}: NewBatchFormProps) {
  const router = useRouter();
  const [isSwitchingClient, startClientSwitch] = useTransition();
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [copiesPerCreative, setCopiesPerCreative] = useState(3);
  const account = accounts.find((candidate) => candidate.id === accountId) ?? accounts[0];
  const client = clients.find((candidate) => candidate.id === clientId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || isSwitchingClient) return;

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
        <Empty
          title="Nenhum cliente cadastrado"
          hint="Cadastre um cliente antes de criar lotes."
          action={<ButtonLink variant="primary" label="Cadastrar cliente" href="/clientes" />}
        />
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isSubmitting || isSwitchingClient}>
      <div className="editor-layout">
        <nav className="editor-nav" aria-label="Etapas de criação">
          <a href="#identidade">
            <span className="step-number">1</span> Cliente e conta
          </a>
          <a href="#configuracao">
            <span className="step-number">2</span> Configuração
          </a>
          <a href="#midias">
            <span className="step-number">3</span> Fotos e vídeos
          </a>
        </nav>

        <fieldset className="editor-sections" disabled={isSubmitting || isSwitchingClient}>
          <section id="identidade" className="editor-section">
            <h2>Cliente e conta de anúncios</h2>
            <p className="section-description">
              Defina para quem você está criando. As mídias e contas pertencem ao cliente escolhido.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cliente">
                <select
                  className={inputClass}
                  name="client_id"
                  value={clientId}
                  onChange={(event) => {
                    const nextClientId = event.target.value;
                    setSelectedAssetIds([]);
                    setErrorMessage(undefined);
                    startClientSwitch(() =>
                      router.replace(`/lotes/novo?client_id=${encodeURIComponent(nextClientId)}`),
                    );
                  }}
                >
                  {clients.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Conta de anúncios">
                <select
                  className={inputClass}
                  name="ad_account_id"
                  required
                  value={account?.id ?? ''}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  {accounts.length === 0 ? <option value="">Nenhuma conta vinculada</option> : null}
                  {accounts.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Nome do lote"
                className="sm:col-span-2"
                hint="Use um nome que ajude a encontrar esta publicação depois."
              >
                <input
                  className={inputClass}
                  name="name"
                  required
                  placeholder="Ex.: Coleção de inverno · Setembro"
                />
              </Field>
            </div>
            {accounts.length === 0 ? (
              <p className="notice notice-warning mt-4">
                Este cliente ainda não tem uma conta.{' '}
                <a className="underline" href="/contas">
                  Vincular conta
                </a>
              </p>
            ) : null}
          </section>

          <section id="configuracao" className="editor-section">
            <h2>Configuração do lote</h2>
            <p className="section-description">
              Use a IA para preparar os textos ou monte os anúncios manualmente. Você revisa tudo
              antes de publicar.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Modo">
                <select
                  className={inputClass}
                  name="mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value === 'manual' ? 'manual' : 'ai')}
                >
                  <option value="ai">Planejamento com IA</option>
                  <option value="manual">Criação manual</option>
                </select>
              </Field>
              <Field
                label="Textos diferentes por foto"
                hint="De 1 a 5 variações por mídia. Apenas no modo IA."
              >
                <input
                  className={inputClass}
                  name="copies_per_creative"
                  type="number"
                  min={1}
                  max={5}
                  value={copiesPerCreative}
                  onChange={(event) => setCopiesPerCreative(Number(event.target.value))}
                  disabled={mode === 'manual'}
                />
              </Field>
              <Field
                label="Sobre o que anunciar"
                className="sm:col-span-2"
                hint={
                  mode === 'ai'
                    ? 'Informe oferta, público e mensagem principal. Obrigatório para a IA.'
                    : 'Opcional. Use para registrar o contexto deste lote.'
                }
              >
                <textarea
                  className={`${inputClass} h-32`}
                  name="briefing"
                  required={mode === 'ai'}
                  placeholder="Ex.: coleção de inverno, 20% OFF até sexta. Público: clientes de Curitiba."
                />
              </Field>
            </div>
          </section>

          <section id="midias" className="editor-section">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2>Fotos e vídeos</h2>
              <a
                href={`/criativos?client_id=${clientId}`}
                className="text-xs text-[var(--color-brand)]"
              >
                Abrir biblioteca
              </a>
            </div>
            <p className="section-description">
              {mode === 'ai'
                ? 'Selecione as mídias aprovadas que a IA vai usar neste lote.'
                : 'No modo manual, você seleciona as mídias e define os textos no construtor, após criar o lote.'}
            </p>
            {mode === 'ai' ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                  <span aria-live="polite" className="text-[var(--color-muted)]">
                    {plural(selectedAssetIds.length, 'mídia selecionada', 'mídias selecionadas')}
                  </span>
                  {assets.length > 0 ? (
                    <button
                      type="button"
                      className="py-1 text-[var(--color-brand)]"
                      onClick={() =>
                        setSelectedAssetIds(
                          selectedAssetIds.length === assets.length
                            ? []
                            : assets.map((asset) => asset.id),
                        )
                      }
                    >
                      {selectedAssetIds.length === assets.length
                        ? 'Limpar seleção'
                        : 'Selecionar todos'}
                    </button>
                  ) : null}
                </div>
                {assets.length === 0 ? (
                  <Empty
                    title="Nenhum criativo aprovado"
                    hint="Envie fotos ou vídeos para este cliente antes de planejar com IA."
                    action={
                      <ButtonLink
                        variant="secondary"
                        label="Enviar fotos e vídeos"
                        href={`/criativos?client_id=${clientId}`}
                      />
                    }
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {assets.map((asset) => (
                      <label key={asset.id} className="media-choice">
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
                          <img
                            src={asset.thumbnail_url}
                            alt=""
                            width={48}
                            height={48}
                            className="h-12 w-12"
                          />
                        ) : (
                          <Icon name="image" size={28} />
                        )}
                        <span className="min-w-0">
                          <span
                            className="block truncate text-xs font-medium"
                            title={asset.filename}
                          >
                            {asset.filename}
                          </span>
                          <span className="text-[11px] text-[var(--color-muted)]">
                            {asset.kind === 'image' ? 'Imagem' : 'Vídeo'} · {asset.aspect_ratio}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="notice">
                <Icon name="image" />
                <span>As mídias aprovadas deste cliente estarão disponíveis na próxima etapa.</span>
              </div>
            )}
          </section>

          {errorMessage ? (
            <p role="alert" className="notice notice-error">
              {errorMessage}
            </p>
          ) : null}
          <div className="editor-footer">
            <p>Nada será publicado nesta etapa.</p>
            <div className="flex items-center gap-2">
              <ButtonLink variant="secondary" label="Cancelar" href="/" />
              <Button
                variant="primary"
                label={isSubmitting ? 'Criando...' : 'Criar lote'}
                type="submit"
                isDisabled={isSubmitting || isSwitchingClient || accounts.length === 0}
              />
            </div>
          </div>
        </fieldset>

        <aside className="editor-aside space-y-4" aria-label="Resumo da criação">
          <Card title="Resumo do lote">
            <dl className="summary-list">
              <div>
                <dt>Cliente</dt>
                <dd>{client?.name}</dd>
              </div>
              <div>
                <dt>Conta de anúncios</dt>
                <dd>{account?.name ?? 'Vincule uma conta para continuar'}</dd>
              </div>
              <div>
                <dt>Modo de criação</dt>
                <dd>{mode === 'ai' ? 'Planejamento com IA' : 'Criação manual'}</dd>
              </div>
              <div>
                <dt>Anúncios a preparar</dt>
                <dd aria-live="polite">
                  {mode === 'ai'
                    ? plural(selectedAssetIds.length * copiesPerCreative, 'anúncio', 'anúncios')
                    : 'Definidos no construtor'}
                </dd>
              </div>
            </dl>
          </Card>
          <div className="notice">
            <Icon name="shield" />
            <div>
              <p className="font-medium">Você decide quando publicar</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Depois de criar, revise os textos, confira o destino e valide o lote. A publicação
                exige sua confirmação.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
