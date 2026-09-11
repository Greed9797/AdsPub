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

import { Card, Empty, Field, inputClass } from '@/components/ui';
import type { AdsetRef, Asset, Batch, CampaignRef } from '@/lib/types';
import type { ActionResult } from '../actions';
import { Button } from '@astryxdesign/core/Button';

type ManualBuilderProps = {
  batchId: string;
  assets: Asset[];
  campaigns: CampaignRef[];
  adsets: AdsetRef[];
  defaultPageId: string | null;
  defaultIgUserId: string | null;
  hasItems: boolean;
  salvarPlanoManualAction: (payload: { batch_id: string; plan: BatchPlan }) => Promise<ActionResult<Batch>>;
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

/** Aceita "1.234,56" e "1234.56"; devolve centavos ou undefined quando vazio. */
function budgetToCents(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed * 100);
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

  const [adsetMode, setAdsetMode] = useState<'existing' | 'new'>(adsets.length > 0 ? 'existing' : 'new');
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

  const selectedAdset = adsets.find((adset) => adset.id === adsetId);
  const totalAds = selectedAssetIds.length * copies.length;
  /** Conjunto existente já vive numa campanha: a campanha deixa de ser escolha livre. */
  const inheritsCampaign = adsetMode === 'existing';
  const inheritedCampaignId = inheritsCampaign ? (selectedAdset?.campaign_id ?? null) : null;
  const inheritedCampaignName = inheritedCampaignId
    ? (campaigns.find((campaign) => campaign.id === inheritedCampaignId)?.name ?? inheritedCampaignId)
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
      setErrorMessage('Toda copy precisa de texto principal.');
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
      setErrorMessage('O conjunto escolhido não tem campanha em cache. Selecione a campanha correspondente.');
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
    const campaignCents = !inheritsCampaign && campaignMode === 'new' ? budgetToCents(campaignBudget) : undefined;
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

    if (hasItems && !window.confirm(`Isto substitui os itens atuais por ${totalAds} anúncio(s). Continuar?`)) {
      return;
    }

    setIsSaving(true);
    const result = await salvarPlanoManualAction({ batch_id: batchId, plan });
    setIsSaving(false);

    if ('erro' in result) {
      setErrorMessage(result.erro);
      return;
    }

    router.refresh();
  };

  if (assets.length === 0) {
    return (
      <Card title="Construtor manual">
        <Empty title="Nenhum criativo aprovado" hint="Envie criativos antes de montar o lote." />
      </Card>
    );
  }

  return (
    <Card title="Construtor manual (criativos × copies)">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Conjunto</h3>
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
              label="Conjunto em cache"
              hint="A campanha do conjunto escolhido é usada automaticamente."
            >
              <select className={inputClass} value={adsetId} onChange={(event) => setAdsetId(event.target.value)}>
                <option value="">
                  {adsets.length === 0 ? 'Nenhum conjunto sincronizado' : 'Selecione o conjunto'}
                </option>
                {adsets.map((adset) => (
                  <option key={adset.id} value={adset.id}>
                    {adset.name} · {adset.optimization_goal} · {adset.effective_status}
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
              <Field label="Meta de otimização">
                <select
                  className={inputClass}
                  value={optimizationGoal}
                  onChange={(event) => setOptimizationGoal(event.target.value)}
                >
                  {optimizationGoalSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Evento de cobrança">
                <select
                  className={inputClass}
                  value={billingEvent}
                  onChange={(event) => setBillingEvent(event.target.value)}
                >
                  {billingEventSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={advantageAudience}
                  onChange={(event) => setAdvantageAudience(event.target.checked)}
                />
                Advantage+ audience (sem público explícito)
              </label>
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-[var(--color-border)] pt-4">
          <h3 className="text-sm font-semibold">Campanha</h3>

          {!inheritsCampaign ? null : !adsetId ? (
            <p className="text-sm text-[var(--color-muted)]">
              Escolha o conjunto acima: a campanha vem dele.
            </p>
          ) : inheritedCampaignId ? (
              <p className="text-sm text-[var(--color-muted)]">
                Herdada do conjunto escolhido: <span className="text-[var(--color-text)]">{inheritedCampaignName}</span>
              </p>
            ) : (
              <Field
                label="Campanha do conjunto"
                hint="O conjunto escolhido não tem campanha em cache. Selecione a campanha em que ele vive."
              >
                <select
                  className={inputClass}
                  value={campaignId}
                  onChange={(event) => setCampaignId(event.target.value)}
                >
                  <option value="">Selecione a campanha</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name} · {campaign.objective} · {campaign.effective_status}
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
                <Field label="Campanha em cache">
                  <select
                    className={inputClass}
                    value={campaignId}
                    onChange={(event) => setCampaignId(event.target.value)}
                  >
                    <option value="">
                      {campaigns.length === 0 ? 'Nenhuma campanha sincronizada' : 'Selecione a campanha'}
                    </option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} · {campaign.objective} · {campaign.effective_status}
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
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Orçamento diário (R$)" hint="Opcional. Vazio deixa o orçamento no conjunto.">
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

        <section className="grid gap-3 border-t border-[var(--color-border)] pt-4 md:grid-cols-2">
          <Field label="Página (page_id)" hint="Padrão da conta. Ajuste para publicar em outra página.">
            <input className={inputClass} value={pageId} onChange={(event) => setPageId(event.target.value)} />
          </Field>
          <Field label="Instagram (ig_user_id)" hint="Vazio publica apenas na página do Facebook.">
            <input className={inputClass} value={igUserId} onChange={(event) => setIgUserId(event.target.value)} />
          </Field>
        </section>

        <section className="space-y-2 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Criativos ({selectedAssetIds.length} de {assets.length})
            </h3>
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <label
                key={asset.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3"
              >
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
                <span className="min-w-0 flex-1 truncate text-sm" title={asset.filename}>
                  {asset.filename}
                </span>
                <span className="text-xs text-[var(--color-muted)]">
                  {asset.kind} · {asset.aspect_ratio}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Copies ({copies.length} de {MAX_COPIES})</h3>
            <button
              type="button"
              className="text-xs text-[var(--color-brand)]"
              disabled={copies.length >= MAX_COPIES}
              onClick={() => setCopies((previous) => [...previous, emptyCopy()])}
            >
              Adicionar copy
            </button>
          </div>

          {copies.map((copy, index) => (
            <div key={`copy-${index}`} className="space-y-3 rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-muted)]">Copy {index + 1}</span>
                {copies.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs text-[var(--color-danger)]"
                    onClick={() => setCopies((previous) => previous.filter((_, i) => i !== index))}
                  >
                    Remover copy
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
                <Field label="CTA">
                  <select
                    className={inputClass}
                    value={copy.cta}
                    onChange={(event) => updateCopy(index, { cta: event.target.value })}
                  >
                    {ctaSchema.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
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

        <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm">
            {selectedAssetIds.length} criativo(s) × {copies.length} copy(ies) ={' '}
            <strong>{totalAds} anúncio(s)</strong>
          </p>

          {errorMessage ? <p className="text-sm text-[var(--color-danger)]">{errorMessage}</p> : null}

          <div className="flex gap-2">
            <Button variant="primary" label={isSaving ? 'Gerando itens...' : 'Gerar itens do lote'} type="submit" isDisabled={isSaving || totalAds === 0} />
            <Button variant="secondary" label="Limpar" isDisabled={isSaving} onClick={() => {
                setSelectedAssetIds([]);
                setCopies([emptyCopy()]);
                setErrorMessage(undefined);
              }} />
          </div>
        </div>
      </form>
    </Card>
  );
}
