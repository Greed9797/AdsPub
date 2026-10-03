'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  billingEventSchema,
  ctaSchema,
  objectiveSchema,
  optimizationGoalSchema,
  type BatchPlan,
} from '@adpub/shared';

import { Button, Card, Empty, Field, ctaLabel, goalLabel, inputClass, plural } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import type { AdsetRef, Asset, Batch, CampaignRef } from '@/lib/types';
import type { ActionResult } from '../actions';

type ManualBuilderProps = {
  batchId: string;
  assets: Asset[];
  campaigns: CampaignRef[];
  adsets: AdsetRef[];
  defaultPageId: string | null;
  defaultIgUserId: string | null;
  hasItems: boolean;
  salvarPlanoManualAction: (payload: {
    batch_id: string;
    plan: BatchPlan;
  }) => Promise<ActionResult<Batch>>;
};

type CopyRow = {
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  link: string;
};

const MAX_COPIES = 5;
const CAMPAIGN_KEY = 'campanha-nova';
const ADSET_KEY = 'conjunto-novo';

const emptyCopy = (): CopyRow => ({
  primary_text: '',
  headline: '',
  description: '',
  cta: 'LEARN_MORE',
  link: '',
});

/** Inteiro ("100"), decimal com vírgula ou ponto ("12,3", "1234.56") ou milhar brasileiro ("1.234,56"); centavos ou undefined quando vazio. */
function budgetToCents(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const grouped = /^(\d{1,3}(?:\.\d{3})+)(,(\d{1,2}))?$/.exec(trimmed);
  const plain = /^(\d+)([.,](\d{1,2}))?$/.exec(trimmed);
  let intDigits: string;
  let fracDigits: string;
  if (grouped) {
    intDigits = grouped[1].replace(/\./g, '');
    fracDigits = grouped[3] ?? '';
  } else if (plain) {
    intDigits = plain[1];
    fracDigits = plain[3] ?? '';
  } else {
    return null;
  }

  const reais = Number(intDigits);
  const centavos = fracDigits ? Number(fracDigits.padEnd(2, '0')) : 0;
  const total = reais * 100 + centavos;
  if (!Number.isSafeInteger(total) || total <= 0) return null;

  return total;
}

export function ManualBuilder({
  batchId,
  assets,
  campaigns,
  adsets,
  defaultPageId,
  defaultIgUserId,
  hasItems,
  salvarPlanoManualAction,
}: ManualBuilderProps) {
  const router = useRouter();

  const [campaignMode, setCampaignMode] = useState<'existing' | 'new'>(
    campaigns.length > 0 ? 'existing' : 'new',
  );
  // Destino nunca é chutado: campanha e conjunto começam sem seleção.
  const [campaignId, setCampaignId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [objective, setObjective] = useState<string>('OUTCOME_SALES');
  const [campaignBudget, setCampaignBudget] = useState('');

  const [adsetMode, setAdsetMode] = useState<'existing' | 'new'>(
    adsets.length > 0 ? 'existing' : 'new',
  );
  const [adsetId, setAdsetId] = useState('');
  const [adsetName, setAdsetName] = useState('');
  const [optimizationGoal, setOptimizationGoal] = useState<string>('OFFSITE_CONVERSIONS');
  const [billingEvent, setBillingEvent] = useState<string>('IMPRESSIONS');
  const [advantageAudience, setAdvantageAudience] = useState(true);
  const [adsetBudget, setAdsetBudget] = useState('');

  const [pageId, setPageId] = useState(defaultPageId ?? '');
  const [igUserId, setIgUserId] = useState(defaultIgUserId ?? '');

  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [copies, setCopies] = useState<CopyRow[]>([emptyCopy()]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [replacementPlan, setReplacementPlan] = useState<BatchPlan | null>(null);

  async function savePlan(plan: BatchPlan) {
    if (isSaving) return;
    setIsSaving(true);
    const result = await salvarPlanoManualAction({ batch_id: batchId, plan });
    setIsSaving(false);
    if ('erro' in result) {
      setErrorMessage(result.erro);
      return;
    }
    router.refresh();
  }

  const selectedAdset = adsets.find((adset) => adset.id === adsetId);
  const totalAds = selectedAssetIds.length * copies.length;
  /** Conjunto existente já vive numa campanha: a campanha deixa de ser escolha livre. */
  const inheritsCampaign = adsetMode === 'existing';
  const inheritedCampaignId = inheritsCampaign ? (selectedAdset?.campaign_id ?? null) : null;
  const inheritedCampaignName = inheritedCampaignId
    ? (campaigns.find((campaign) => campaign.id === inheritedCampaignId)?.name ??
      inheritedCampaignId)
    : undefined;

  const updateCopy = (index: number, patch: Partial<CopyRow>) => {
    setCopies((previous) =>
      previous.map((copy, copyIndex) => (copyIndex === index ? { ...copy, ...patch } : copy)),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(undefined);

    if (selectedAssetIds.length === 0) {
      setErrorMessage('Selecione pelo menos um criativo.');
      return;
    }

    if (copies.some((copy) => !copy.primary_text.trim())) {
      setErrorMessage('Toda variação precisa de um texto principal.');
      return;
    }

    if (inheritsCampaign && !adsetId) {
      setErrorMessage('Escolha o conjunto de destino.');
      return;
    }

    if (!inheritsCampaign && !adsetName.trim()) {
      setErrorMessage('Informe o nome do novo conjunto.');
      return;
    }

    if (inheritsCampaign && !inheritedCampaignId && !campaignId) {
      setErrorMessage(
        'O conjunto escolhido não tem campanha em cache. Selecione a campanha correspondente.',
      );
      return;
    }

    if (!inheritsCampaign && campaignMode === 'existing' && !campaignId) {
      setErrorMessage('Escolha a campanha de destino.');
      return;
    }

    if (!inheritsCampaign && campaignMode === 'new' && !campaignName.trim()) {
      setErrorMessage('Informe o nome da nova campanha.');
      return;
    }

    // Orçamento só conta no modo em que o campo está visível: valor antigo de um
    // modo abandonado não pode bloquear o envio.
    const campaignCents =
      !inheritsCampaign && campaignMode === 'new' ? budgetToCents(campaignBudget) : undefined;
    const adsetCents = inheritsCampaign ? undefined : budgetToCents(adsetBudget);
    if (campaignCents === null || adsetCents === null) {
      setErrorMessage('Orçamento diário inválido. Use um valor em reais maior que zero.');
      return;
    }

    const campaignRef: BatchPlan['items'][number]['campaign_ref'] = inheritsCampaign
      ? { kind: 'existing', id: inheritedCampaignId ?? campaignId }
      : campaignMode === 'existing'
        ? { kind: 'existing', id: campaignId }
        : { kind: 'new', key: CAMPAIGN_KEY };

    const adsetRef: BatchPlan['items'][number]['adset_ref'] = inheritsCampaign
      ? { kind: 'existing', id: adsetId }
      : { kind: 'new', key: ADSET_KEY };

    const planCopies = copies.map((copy) => ({
      primary_text: copy.primary_text.trim(),
      headline: copy.headline.trim(),
      description: copy.description.trim(),
      cta: ctaSchema.parse(copy.cta),
      link: copy.link.trim(),
      display_link: '',
      url_tags: '',
    }));

    const plan: BatchPlan = {
      campaigns:
        campaignRef.kind === 'new'
          ? [
              {
                key: CAMPAIGN_KEY,
                name: campaignName.trim(),
                objective: objectiveSchema.parse(objective),
                buying_type: 'AUCTION',
                special_ad_categories: [],
                ...(campaignCents !== undefined ? { daily_budget_cents: campaignCents } : {}),
              },
            ]
          : [],
      adsets:
        adsetRef.kind === 'new'
          ? [
              {
                key: ADSET_KEY,
                name: adsetName.trim(),
                optimization_goal: optimizationGoalSchema.parse(optimizationGoal),
                billing_event: billingEventSchema.parse(billingEvent),
                advantage_audience: advantageAudience,
                ...(campaignRef.kind === 'new' ? { campaign_key: CAMPAIGN_KEY } : {}),
                ...(adsetCents !== undefined ? { daily_budget_cents: adsetCents } : {}),
              },
            ]
          : [],
      items: selectedAssetIds.map((assetId) => {
        const asset = assets.find((candidate) => candidate.id === assetId);

        return {
          format: asset?.kind === 'video' ? ('single_video' as const) : ('single_image' as const),
          asset_ids: [assetId],
          campaign_ref: campaignRef,
          adset_ref: adsetRef,
          copies: planCopies,
          ...(pageId.trim() ? { page_id: pageId.trim() } : {}),
          ig_user_id: igUserId.trim() || null,
        };
      }),
      pending: [],
      notes: `Plano manual: ${selectedAssetIds.length} criativo(s) × ${copies.length} copy(ies).`,
    };

    if (hasItems) {
      setReplacementPlan(plan);
      return;
    }
    await savePlan(plan);
  };

  if (assets.length === 0) {
    return (
      <Card title="Construtor manual">
        <Empty title="Nenhum criativo aprovado" hint="Envie criativos antes de montar o lote." />
      </Card>
    );
  }

  return (
    <Card title="Construtor manual">
      <nav
        className="mb-5 flex flex-wrap gap-3 border-b border-[var(--ap-line)] pb-3 text-xs text-[var(--ap-orange-text)]"
        aria-label="Seções do construtor"
      >
        <a href="#destino-manual">Destino</a>
        <a href="#identidade-manual">Identidade</a>
        <a href="#midias-manual">Mídias</a>
        <a href="#textos-manual">Textos</a>
      </nav>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <fieldset className="space-y-5" disabled={isSaving}>
          <section id="destino-manual" className="space-y-3">
            <h3 className="text-sm font-semibold">Conjunto de anúncios</h3>
            <p className="text-xs text-[var(--ap-text-2)]">
              Escolha o destino. Um conjunto existente já define a campanha; um novo conjunto
              permite escolher ou criar uma campanha.
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="conjunto-modo"
                  checked={adsetMode === 'existing'}
                  disabled={adsets.length === 0}
                  onChange={() => setAdsetMode('existing')}
                />
                Usar conjunto existente
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="conjunto-modo"
                  checked={adsetMode === 'new'}
                  onChange={() => setAdsetMode('new')}
                />
                Criar conjunto
              </label>
            </div>

            {adsetMode === 'existing' ? (
              <Field
                label="Conjunto de anúncios"
                hint="A campanha do conjunto escolhido é usada automaticamente."
              >
                <select
                  className={inputClass}
                  value={adsetId}
                  onChange={(event) => setAdsetId(event.target.value)}
                >
                  <option value="">
                    {adsets.length === 0 ? 'Nenhum conjunto sincronizado' : 'Selecione o conjunto'}
                  </option>
                  {adsets.map((adset) => (
                    <option key={adset.id} value={adset.id}>
                      {adset.name} · {goalLabel(adset.optimization_goal)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nome do conjunto">
                  <input
                    className={inputClass}
                    value={adsetName}
                    onChange={(event) => setAdsetName(event.target.value)}
                  />
                </Field>
                <Field label="Orçamento diário (R$)" hint="Opcional.">
                  <input
                    className={inputClass}
                    value={adsetBudget}
                    inputMode="decimal"
                    onChange={(event) => setAdsetBudget(event.target.value)}
                  />
                </Field>
                <details className="md:col-span-2 rounded-lg border border-[var(--ap-line)] p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Otimização e cobrança{' '}
                    <span className="font-normal text-[var(--ap-text-2)]">
                      (opções avançadas)
                    </span>
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <Field label="Meta de otimização" hint="Padrão: Vendas no site.">
                      <select
                        className={inputClass}
                        value={optimizationGoal}
                        onChange={(event) => setOptimizationGoal(event.target.value)}
                      >
                        {optimizationGoalSchema.options.map((option) => (
                          <option key={option} value={option}>
                            {goalLabel(option)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Evento de cobrança" hint="Padrão: Exibições.">
                      <select
                        className={inputClass}
                        value={billingEvent}
                        onChange={(event) => setBillingEvent(event.target.value)}
                      >
                        {billingEventSchema.options.map((option) => (
                          <option key={option} value={option}>
                            {goalLabel(option)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <label className="inline-flex items-center gap-2 text-sm md:pt-7">
                      <input
                        type="checkbox"
                        checked={advantageAudience}
                        onChange={(event) => setAdvantageAudience(event.target.checked)}
                      />
                      Público Advantage+ (seleção automática)
                    </label>
                  </div>
                </details>
              </div>
            )}
          </section>

          <section className="space-y-3 border-t border-[var(--ap-line)] pt-4">
            <h3 className="text-sm font-semibold">Campanha</h3>

            {!inheritsCampaign ? null : !adsetId ? (
              <p className="text-sm text-[var(--ap-text-2)]">
                Escolha o conjunto acima: a campanha vem dele.
              </p>
            ) : inheritedCampaignId ? (
              <p className="text-sm text-[var(--ap-text-2)]">
                Herdada do conjunto escolhido:{' '}
                <span className="text-[var(--ap-text-1)]">{inheritedCampaignName}</span>
              </p>
            ) : (
              <Field
                label="Campanha do conjunto"
                hint="Sem campanha sincronizada para este conjunto. Selecione a campanha correspondente."
              >
                <select
                  className={inputClass}
                  value={campaignId}
                  onChange={(event) => setCampaignId(event.target.value)}
                >
                  <option value="">Selecione a campanha</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name} · {goalLabel(campaign.objective)}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {inheritsCampaign ? null : (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="campanha-modo"
                      checked={campaignMode === 'existing'}
                      disabled={campaigns.length === 0}
                      onChange={() => setCampaignMode('existing')}
                    />
                    Usar campanha existente
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="campanha-modo"
                      checked={campaignMode === 'new'}
                      onChange={() => setCampaignMode('new')}
                    />
                    Criar campanha
                  </label>
                </div>

                {campaignMode === 'existing' ? (
                  <Field label="Campanha existente">
                    <select
                      className={inputClass}
                      value={campaignId}
                      onChange={(event) => setCampaignId(event.target.value)}
                    >
                      <option value="">
                        {campaigns.length === 0
                          ? 'Nenhuma campanha sincronizada'
                          : 'Selecione a campanha'}
                      </option>
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name} · {goalLabel(campaign.objective)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Nome da campanha">
                      <input
                        className={inputClass}
                        value={campaignName}
                        onChange={(event) => setCampaignName(event.target.value)}
                      />
                    </Field>
                    <Field label="Objetivo">
                      <select
                        className={inputClass}
                        value={objective}
                        onChange={(event) => setObjective(event.target.value)}
                      >
                        {objectiveSchema.options.map((option) => (
                          <option key={option} value={option}>
                            {goalLabel(option)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="Orçamento diário (R$)"
                      hint="Opcional. Vazio deixa o orçamento no conjunto."
                    >
                      <input
                        className={inputClass}
                        value={campaignBudget}
                        inputMode="decimal"
                        onChange={(event) => setCampaignBudget(event.target.value)}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}
          </section>

          <section
            id="identidade-manual"
            className="grid gap-3 border-t border-[var(--ap-line)] pt-4 md:grid-cols-2"
          >
            <h3 className="text-sm font-semibold md:col-span-2">Identidade do anúncio</h3>
            <Field
              label="Página do Facebook"
              hint="Padrão da conta. Ajuste para publicar em outra página."
            >
              <input
                className={inputClass}
                value={pageId}
                onChange={(event) => setPageId(event.target.value)}
              />
            </Field>
            <Field label="Instagram" hint="Vazio publica apenas na página do Facebook.">
              <input
                className={inputClass}
                value={igUserId}
                onChange={(event) => setIgUserId(event.target.value)}
              />
            </Field>
          </section>

          <section
            id="midias-manual"
            className="space-y-2 border-t border-[var(--ap-line)] pt-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Criativos ({selectedAssetIds.length} de {assets.length})
              </h3>
              <button
                type="button"
                className="text-xs text-[var(--ap-orange-text)]"
                onClick={() =>
                  setSelectedAssetIds((previous) =>
                    previous.length === assets.length ? [] : assets.map((asset) => asset.id),
                  )
                }
              >
                {selectedAssetIds.length === assets.length ? 'Limpar seleção' : 'Selecionar todos'}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => (
                <label key={asset.id} className="ap-choice">
                  <input
                    type="checkbox"
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
                      width={40}
                      height={40}
                      className="h-10 w-10"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-sm" title={asset.filename}>
                    {asset.filename}
                  </span>
                  <span className="text-xs text-[var(--ap-text-2)]">
                    {asset.kind === 'image' ? 'Imagem' : 'Vídeo'} · {asset.aspect_ratio}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section
            id="textos-manual"
            className="space-y-3 border-t border-[var(--ap-line)] pt-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Variações de texto ({copies.length} de {MAX_COPIES})
              </h3>
              <button
                type="button"
                className="text-xs text-[var(--ap-orange-text)]"
                disabled={copies.length >= MAX_COPIES}
                onClick={() => setCopies((previous) => [...previous, emptyCopy()])}
              >
                Adicionar texto
              </button>
            </div>

            {copies.map((copy, index) => (
              <div
                key={`copy-${index}`}
                className="space-y-3 rounded-lg border border-[var(--ap-line)] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--ap-text-2)]">
                    Variação {index + 1}
                  </span>
                  {copies.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-[var(--ap-error)]"
                      onClick={() =>
                        setCopies((previous) => previous.filter((_, i) => i !== index))
                      }
                    >
                      Remover variação
                    </button>
                  ) : null}
                </div>

                <Field label="Texto principal">
                  <textarea
                    className={`${inputClass} h-20`}
                    value={copy.primary_text}
                    maxLength={2000}
                    onChange={(event) => updateCopy(index, { primary_text: event.target.value })}
                  />
                </Field>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Título">
                    <input
                      className={inputClass}
                      value={copy.headline}
                      maxLength={255}
                      onChange={(event) => updateCopy(index, { headline: event.target.value })}
                    />
                  </Field>
                  <Field label="Descrição">
                    <input
                      className={inputClass}
                      value={copy.description}
                      maxLength={255}
                      onChange={(event) => updateCopy(index, { description: event.target.value })}
                    />
                  </Field>
                  <Field label="Botão do anúncio">
                    <select
                      className={inputClass}
                      value={copy.cta}
                      onChange={(event) => updateCopy(index, { cta: event.target.value })}
                    >
                      {ctaSchema.options.map((option) => (
                        <option key={option} value={option}>
                          {ctaLabel(option)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Link" hint="Vazio deixa o item bloqueado na validação.">
                    <input
                      className={inputClass}
                      value={copy.link}
                      onChange={(event) => updateCopy(index, { link: event.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </section>

          <div className="ap-builder__foot">
            <p aria-live="polite">
              {plural(selectedAssetIds.length, 'mídia', 'mídias')} ×{' '}
              {plural(copies.length, 'texto', 'textos')} ={' '}
              <strong>{plural(totalAds, 'anúncio', 'anúncios')}</strong>
            </p>

            {errorMessage ? (
              <p role="alert" className="text-sm text-[var(--ap-error)]">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button
                variant="primary"
                label={isSaving ? 'Gerando itens...' : 'Gerar itens do lote'}
                type="submit"
                isDisabled={isSaving || totalAds === 0}
              />
              <Button
                variant="secondary"
                label="Limpar"
                isDisabled={isSaving}
                onClick={() => {
                  setSelectedAssetIds([]);
                  setCopies([emptyCopy()]);
                  setErrorMessage(undefined);
                }}
              />
            </div>
          </div>
        </fieldset>
      </form>
      <ConfirmDialog
        isOpen={replacementPlan !== null}
        title="Substituir os anúncios deste lote?"
        confirmLabel="Substituir anúncios"
        destructive
        onCancel={() => setReplacementPlan(null)}
        onConfirm={() => {
          if (!replacementPlan) return;
          const plan = replacementPlan;
          setReplacementPlan(null);
          void savePlan(plan);
        }}
      >
        <p>
          Os textos e itens atuais serão apagados e substituídos por{' '}
          <strong>
            {plural(
              replacementPlan?.items.reduce((total, item) => total + item.copies.length, 0) ?? 0,
              'anúncio',
              'anúncios',
            )}
          </strong>
          .
        </p>
        <p>Essa ação não pode ser desfeita. Cancele para manter os anúncios atuais.</p>
      </ConfirmDialog>
    </Card>
  );
}
