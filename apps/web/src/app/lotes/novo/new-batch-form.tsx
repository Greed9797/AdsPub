'use client';

import { useId, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Card, Empty, Field, Selo, inputClass, plural } from '@/components/ui';
import { Icon } from '@/components/icons';
import { revisaoFinal } from '@/lib/publicacao';
import type { AdAccount, Asset, Client } from '@/lib/types';
import type { ActionResult } from '../actions';

type NewBatchFormProps = {
  clients: Client[];
  accounts: AdAccount[];
  assets: Asset[];
  clientId: string;
  /** Quantos anúncios cada conta ainda aceita hoje, pelo painel de saúde. Conta ausente = sem aviso. */
  saldos: Record<string, number>;
  /** Mídias já marcadas (vindas da biblioteca de criativos). */
  initialAssetIds?: string[];
  criarLoteAction: (formData: FormData) => Promise<ActionResult<{ id: string }>>;
};

type Modo = 'ai' | 'manual';
type FiltroMidia = 'todas' | 'image' | 'video';

const MODOS: ReadonlyArray<{ valor: Modo; titulo: string; texto: string }> = [
  {
    valor: 'ai',
    titulo: 'Planejamento com IA',
    texto: 'A IA propõe textos, nomes padronizados e UTM a partir do briefing. Cada anúncio vira um rascunho editável.',
  },
  {
    valor: 'manual',
    titulo: 'Criação manual',
    texto: 'Você escreve cada anúncio e escolhe a mídia. Indicado quando o texto já está aprovado.',
  },
];

const ETAPAS = [
  { id: 'identidade', rotulo: 'Cliente e conta' },
  { id: 'configuracao', rotulo: 'Como montar' },
  { id: 'midias', rotulo: 'Fotos e vídeos' },
] as const;

export function NewBatchForm({ clients, accounts, assets, clientId, saldos, initialAssetIds = [], criarLoteAction }: NewBatchFormProps) {
  const router = useRouter();
  const [isSwitchingClient, startClientSwitch] = useTransition();
  const [mode, setMode] = useState<Modo>('ai');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>(initialAssetIds);
  const [filtro, setFiltro] = useState<FiltroMidia>('todas');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [midiaErro, setMidiaErro] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [copiesPerCreative, setCopiesPerCreative] = useState(3);
  const midiaErroId = useId();
  const account = accounts.find((candidate) => candidate.id === accountId) ?? accounts[0];
  const client = clients.find((candidate) => candidate.id === clientId);
  const anuncios = mode === 'ai' ? selectedAssetIds.length * copiesPerCreative : 0;
  const saldo = account ? saldos[account.id] : undefined;
  const previa = revisaoFinal(anuncios, saldo);
  const visiveis = assets.filter((asset) => filtro === 'todas' || asset.kind === filtro);
  const ocupado = isSubmitting || isSwitchingClient;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (ocupado) return;

    const formData = new FormData(event.currentTarget);

    if (mode === 'ai' && selectedAssetIds.length === 0) {
      setMidiaErro('Selecione pelo menos um criativo para o planejamento por IA.');
      return;
    }

    setErrorMessage(undefined);
    setMidiaErro(undefined);
    setIsSubmitting(true);

    const result = await criarLoteAction(formData);

    // Sucesso redireciona no servidor; só voltamos aqui em caso de erro. Os campos
    // são do próprio formulário e não são limpos, então o que foi digitado fica.
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
          action={<Button variant="primary" label="Cadastrar cliente" href="/clientes" />}
        />
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={ocupado} className="ap-novo">
      <nav className="ap-steps" aria-label="Etapas de criação">
        {ETAPAS.map((etapa, i) => (
          <a key={etapa.id} href={`#${etapa.id}`} className="ap-steps__step ap-t-body-strong">
            <span className="ap-steps__n ap-t-num-s">{i + 1}</span> {etapa.rotulo}
          </a>
        ))}
      </nav>

      <div className="ap-novo__grid">
        <fieldset className="ap-novo__main" disabled={ocupado}>
          <section id="identidade" className="ap-card ap-novo__section">
            <h2 className="ap-t-block">Cliente e conta de anúncios</h2>
            <p className="ap-novo__desc ap-t-small">As mídias e as contas pertencem ao cliente escolhido.</p>
            <div className="ap-novo__pair">
              <Field label="Cliente">
                <select
                  className={inputClass}
                  name="client_id"
                  value={clientId}
                  onChange={(event) => {
                    const nextClientId = event.target.value;
                    setSelectedAssetIds([]);
                    setErrorMessage(undefined);
                    setMidiaErro(undefined);
                    startClientSwitch(() => router.replace(`/lotes/novo?client_id=${encodeURIComponent(nextClientId)}`));
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
            </div>
            <Field label="Nome do lote" hint="Use um nome que ajude a encontrar esta publicação depois.">
              <input className={inputClass} name="name" required placeholder="Ex.: Coleção de inverno · Setembro" />
            </Field>
            {accounts.length === 0 ? (
              <p className="ap-note" data-tone="warn">
                Este cliente ainda não tem uma conta. <a href="/contas">Vincular conta</a>
              </p>
            ) : null}
          </section>

          <section id="configuracao" className="ap-card ap-novo__section">
            <h2 className="ap-t-block">Como montar os anúncios</h2>
            <p className="ap-novo__desc ap-t-small">
              Use a IA para preparar textos, nomes e UTM, ou monte manualmente. Você revisa antes de publicar.
            </p>
            <div role="radiogroup" aria-label="Modo" className="ap-modos">
              {MODOS.map((opcao) => (
                <label key={opcao.valor} className="ap-modo" data-selected={mode === opcao.valor ? 'true' : undefined}>
                  <input
                    type="radio"
                    name="mode"
                    value={opcao.valor}
                    checked={mode === opcao.valor}
                    onChange={() => setMode(opcao.valor)}
                  />
                  <span className="ap-t-body-strong">{opcao.titulo}</span>
                  <span className="ap-t-small ap-modo__text">{opcao.texto}</span>
                </label>
              ))}
            </div>
            <Field
              label="Sobre o que anunciar"
              hint={
                mode === 'ai'
                  ? 'Informe oferta, público e mensagem principal. Obrigatório para a IA.'
                  : 'Opcional. Use para registrar o contexto deste lote.'
              }
            >
              <textarea
                className={inputClass}
                name="briefing"
                required={mode === 'ai'}
                placeholder="Ex.: coleção de inverno, 20% OFF até sexta. Público: clientes de Curitiba."
              />
            </Field>
            <div className="ap-field">
              <label className="ap-field__label ap-t-body-strong" htmlFor="copies-per-creative">
                Textos diferentes por foto
              </label>
              <span className="ap-stepper">
                <button
                  type="button"
                  className="ap-stepper__btn"
                  aria-label="Diminuir variações"
                  disabled={mode === 'manual' || copiesPerCreative <= 1}
                  onClick={() => setCopiesPerCreative((n) => Math.max(1, n - 1))}
                >
                  −
                </button>
                <input
                  id="copies-per-creative"
                  className={`${inputClass} ap-stepper__input`}
                  name="copies_per_creative"
                  type="number"
                  min={1}
                  max={5}
                  value={copiesPerCreative}
                  aria-describedby="copies-per-creative-hint"
                  onChange={(event) => setCopiesPerCreative(Number(event.target.value))}
                  disabled={mode === 'manual'}
                />
                <button
                  type="button"
                  className="ap-stepper__btn"
                  aria-label="Aumentar variações"
                  disabled={mode === 'manual' || copiesPerCreative >= 5}
                  onClick={() => setCopiesPerCreative((n) => Math.min(5, n + 1))}
                >
                  +
                </button>
              </span>
              <p className="ap-field__hint ap-t-small" id="copies-per-creative-hint">
                De 1 a 5 variações por mídia. Só no modo IA.
              </p>
            </div>
          </section>

          <section id="midias" className="ap-card ap-novo__section">
            <div className="ap-novo__sechead">
              <h2 className="ap-t-block">Fotos e vídeos</h2>
              <a href={`/criativos?client_id=${clientId}`}>Abrir biblioteca</a>
            </div>
            <p className="ap-novo__desc ap-t-small">
              {mode === 'ai'
                ? `Escolha as mídias aprovadas que entram no lote. ${plural(selectedAssetIds.length, 'selecionada', 'selecionadas')}.`
                : 'No modo manual, você seleciona as mídias e define os textos no construtor, depois de criar o lote.'}
            </p>
            {mode === 'ai' ? (
              <>
                {assets.length > 0 ? (
                  <div className="ap-novo__filters">
                    {(
                      [
                        ['todas', 'Aprovadas', assets.length],
                        ['image', 'Imagens', assets.filter((a) => a.kind === 'image').length],
                        ['video', 'Vídeos', assets.filter((a) => a.kind === 'video').length],
                      ] as const
                    ).map(([valor, rotulo, total]) => (
                      <button
                        key={valor}
                        type="button"
                        className={filtro === valor ? 'ap-chip ap-chip--active ap-t-body' : 'ap-chip ap-t-body'}
                        aria-pressed={filtro === valor}
                        onClick={() => setFiltro(valor)}
                      >
                        {rotulo} <span className="ap-chip__count ap-t-num-s">{total}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="ap-novo__all"
                      onClick={() =>
                        setSelectedAssetIds(
                          selectedAssetIds.length === assets.length ? [] : assets.map((asset) => asset.id),
                        )
                      }
                    >
                      {selectedAssetIds.length === assets.length ? 'Limpar seleção' : 'Selecionar todos'}
                    </button>
                  </div>
                ) : null}
                {assets.length === 0 ? (
                  <Empty
                    title="Nenhum criativo aprovado"
                    hint="Envie fotos ou vídeos para este cliente antes de planejar com IA."
                    action={<Button variant="secondary" label="Enviar fotos e vídeos" href={`/criativos?client_id=${clientId}`} />}
                  />
                ) : (
                  <div className="ap-media" aria-describedby={midiaErro ? midiaErroId : undefined}>
                    {visiveis.map((asset) => (
                      <label key={asset.id} className="ap-media__item">
                        <input
                          type="checkbox"
                          className="ap-check"
                          name="asset_ids"
                          value={asset.id}
                          checked={selectedAssetIds.includes(asset.id)}
                          onChange={(event) => {
                            setMidiaErro(undefined);
                            setSelectedAssetIds((previous) =>
                              event.target.checked ? [...previous, asset.id] : previous.filter((id) => id !== asset.id),
                            );
                          }}
                        />
                        {asset.thumbnail_url ? (
                          <img src={asset.thumbnail_url} alt="" className="ap-media__thumb" />
                        ) : (
                          <span className="ap-media__thumb ap-media__thumb--vazia">
                            <Icon name="image" size={24} />
                          </span>
                        )}
                        <span className="ap-media__text">
                          <span className="ap-t-ref" title={asset.filename}>
                            {asset.filename}
                          </span>
                          <span className="ap-t-small">
                            {asset.kind === 'image' ? 'Imagem' : 'Vídeo'} · {asset.aspect_ratio}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {midiaErro ? (
                  <p id={midiaErroId} role="alert" className="ap-note" data-tone="danger">
                    {midiaErro}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="ap-note">
                <Icon name="image" />
                As mídias aprovadas deste cliente estarão disponíveis na próxima etapa.
              </p>
            )}
          </section>
        </fieldset>

        <aside className="ap-novo__aside" aria-label="Resumo da criação">
          <Card title="Resumo do lote">
            <dl className="ap-resumo">
              <div>
                <dt>Cliente</dt>
                <dd>{client?.name}</dd>
              </div>
              <div>
                <dt>Conta de anúncios</dt>
                <dd>{account?.name ?? 'Vincule uma conta'}</dd>
              </div>
              <div>
                <dt>Modo</dt>
                <dd>{mode === 'ai' ? 'Planejamento com IA' : 'Criação manual'}</dd>
              </div>
              {mode === 'ai' ? (
                <>
                  <div>
                    <dt>Mídias escolhidas</dt>
                    <dd>{selectedAssetIds.length}</dd>
                  </div>
                  <div>
                    <dt>Variações por mídia</dt>
                    <dd>{plural(copiesPerCreative, 'texto', 'textos')}</dd>
                  </div>
                </>
              ) : null}
              <div className="ap-resumo__total">
                <dt>Anúncios a preparar</dt>
                <dd aria-live="polite">{mode === 'ai' ? anuncios : 'Definidos no construtor'}</dd>
              </div>
            </dl>
          </Card>
          {previa.excede ? (
            <div className="ap-note" data-tone="danger" role="status">
              <div>
                <p className="ap-t-body-strong">Acima do limite diário da conta</p>
                <p className="ap-t-small">
                  {account?.name} aceita mais {plural(previa.entram, 'anúncio', 'anúncios')} hoje e este lote tem {anuncios}. Os
                  outros {previa.ficamDeFora} não entram na fila hoje.
                </p>
              </div>
            </div>
          ) : null}
          <div className="ap-note">
            <Icon name="shield" />
            <div>
              <p className="ap-t-body-strong">Você decide quando publicar</p>
              <p className="ap-t-small">
                Depois de criar, revise os textos, confira o destino e valide o lote. A publicação exige a sua confirmação.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {errorMessage ? (
        <p role="alert" className="ap-note" data-tone="danger">
          {errorMessage}
        </p>
      ) : null}
      <div className="ap-actionbar">
        <p className="ap-t-small">
          <Selo tone="rascunho" label="Rascunho" /> Nada será publicado nesta etapa. O lote nasce como rascunho.
        </p>
        <div className="ap-actionbar__buttons">
          <Button variant="ghost" label="Cancelar" href="/" />
          <Button
            variant="primary"
            label={isSubmitting ? 'Criando...' : mode === 'ai' && anuncios > 0 ? `Criar lote com ${plural(anuncios, 'anúncio', 'anúncios')}` : 'Criar lote'}
            type="submit"
            isDisabled={ocupado || accounts.length === 0}
          />
        </div>
      </div>
    </form>
  );
}
