'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ctaSchema } from '@adpub/shared';

import { Button, Dialog, Field, Selo, ctaLabel, formatLabel, inputClass } from '@/components/ui';
import { AdPreview } from '@/components/ad-preview';
import type { AdDraft, Asset, Copy } from '@/lib/types';
import type { ActionResult } from '../actions';

export type SalvarItemPayload = {
  batch_id: string;
  item_id: string;
  version: number;
  name: string;
  page_id: string;
  ig_user_id: string | null;
  copy: Copy;
};

type ItemEditorProps = {
  batchId: string;
  item: AdDraft;
  assets: Asset[];
  salvarItemAction: (payload: SalvarItemPayload) => Promise<ActionResult<AdDraft>>;
  onSaved: () => void;
};

function descreverRef(ref: AdDraft['campaign_ref']): string {
  return ref.kind === 'new' ? `${ref.key} · nova neste lote` : `${ref.id} · já existe na Meta`;
}

export function ItemEditor({ batchId, item, assets, salvarItemAction, onSaved }: ItemEditorProps) {
  const router = useRouter();

  const [name, setName] = useState(item.name);
  const [pageId, setPageId] = useState(item.page_id);
  const [igUserId, setIgUserId] = useState(item.ig_user_id ?? '');
  const [primaryText, setPrimaryText] = useState(item.copy.primary_text);
  const [headline, setHeadline] = useState(item.copy.headline);
  const [description, setDescription] = useState(item.copy.description);
  const [cta, setCta] = useState(item.copy.cta);
  const [link, setLink] = useState(item.copy.link);
  const [urlTags, setUrlTags] = useState(item.copy.url_tags);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const titleId = useId();
  const referencia = `AD-${String(item.position + 1).padStart(2, '0')}`;
  // Erros, avisos e política do próprio item: a validação já vem no item, só
  // não era mostrada onde a correção acontece.
  const pendencias = [
    ...(item.validation?.errors ?? []).map((issue) => ({
      chave: `erro-${issue.code}-${issue.field}`,
      tipo: 'erro' as const,
      message: issue.message,
      campo: issue.field,
      fix: issue.fix,
    })),
    ...(item.validation?.policy ?? []).map((issue, index) => ({
      chave: `politica-${issue.category}-${index}`,
      tipo: (issue.severity === 'error' ? 'erro' : 'aviso') as 'erro' | 'aviso',
      message: `Política: ${issue.category}: ${issue.excerpt}`,
      campo: '',
      fix: '',
    })),
    ...(item.validation?.warnings ?? []).map((issue) => ({
      chave: `aviso-${issue.code}-${issue.field}`,
      tipo: 'aviso' as const,
      message: issue.message,
      campo: issue.field,
      fix: '',
    })),
  ];
  const dirty =
    name !== item.name ||
    pageId !== item.page_id ||
    igUserId !== (item.ig_user_id ?? '') ||
    primaryText !== item.copy.primary_text ||
    headline !== item.copy.headline ||
    description !== item.copy.description ||
    cta !== item.copy.cta ||
    link !== item.copy.link ||
    urlTags !== item.copy.url_tags;

  function requestClose() {
    if (isSaving) return;
    if (dirty) setShowDiscard(true);
    else onSaved();
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    if (!name.trim() || !pageId.trim() || !primaryText.trim()) {
      setErrorMessage('Preencha nome, página e texto principal.');
      return;
    }

    setErrorMessage(undefined);
    setIsSaving(true);

    const result = await salvarItemAction({
      batch_id: batchId,
      item_id: item.id,
      version: item.version,
      name,
      page_id: pageId,
      ig_user_id: igUserId.trim() || null,
      // O spread mantém campos que este editor não expõe (display_link, cards do carrossel).
      copy: {
        ...item.copy,
        primary_text: primaryText,
        headline,
        description,
        cta,
        link,
        url_tags: urlTags,
      },
    });

    setIsSaving(false);

    if ('erro' in result) {
      setErrorMessage(result.erro);
      return;
    }

    router.refresh();
    onSaved();
  };

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      placement="side"
      width={640}
      aria-labelledby={titleId}
    >
      <form onSubmit={handleSubmit} className="ap-ficha">
        <header className="ap-ficha__head">
          <div>
            <p className="ap-t-ref ap-ficha__ref">
              Ficha do anúncio · {referencia} <Selo status={item.status} />
            </p>
            <h2 id={titleId} className="ap-t-title-m">
              Editar anúncio
            </h2>
            <p className="ap-t-small ap-ficha__name">{item.name}</p>
          </div>
          <Button variant="secondary" size="sm" label="Fechar" onClick={requestClose} isDisabled={isSaving} />
        </header>

        <div className="ap-ficha__preview-row">
          <AdPreview
            pageLabel={pageId ? `Página ${pageId}` : ''}
            copy={{ primary_text: primaryText, headline, description, cta, link }}
            asset={assets.find((asset) => asset.id === item.asset_ids[0])}
            mediaCount={item.asset_ids.length}
          />
          <dl className="ap-ficha__facts" aria-label="Campanha e conjunto">
            <div>
              <dt className="ap-t-ref">Formato</dt>
              <dd className="ap-t-body-strong">{formatLabel(item.format)}</dd>
            </div>
            <div>
              <dt className="ap-t-ref">Campanha</dt>
              <dd className="ap-t-body-strong">{descreverRef(item.campaign_ref)}</dd>
            </div>
            <div>
              <dt className="ap-t-ref">Conjunto</dt>
              <dd className="ap-t-body-strong">{descreverRef(item.adset_ref)}</dd>
            </div>
          </dl>
        </div>

        <fieldset disabled={isSaving} className="ap-ficha__fields">
          <legend className="ap-t-section">Textos do anúncio</legend>
          <Field label="Nome do anúncio">
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <div className="ap-ficha__pair">
            <Field label="Página do Facebook" hint="ID da página responsável pelo anúncio.">
              <input className={inputClass} value={pageId} onChange={(event) => setPageId(event.target.value)} required />
            </Field>
            <Field label="Instagram" hint="Opcional. Vazio publica apenas no Facebook.">
              <input className={inputClass} value={igUserId} onChange={(event) => setIgUserId(event.target.value)} />
            </Field>
          </div>
          <Field label="Texto principal" hint={`${primaryText.length} de 2.000 caracteres`}>
            <textarea
              className={inputClass}
              value={primaryText}
              maxLength={2000}
              onChange={(event) => setPrimaryText(event.target.value)}
              required
            />
          </Field>
          <div className="ap-ficha__pair">
            <Field label="Título">
              <input className={inputClass} value={headline} maxLength={255} onChange={(event) => setHeadline(event.target.value)} />
            </Field>
            <Field label="Descrição">
              <input className={inputClass} value={description} maxLength={255} onChange={(event) => setDescription(event.target.value)} />
            </Field>
          </div>
          <div className="ap-ficha__pair">
            <Field label="Botão do anúncio">
              <select className={inputClass} value={cta} onChange={(event) => setCta(event.target.value)}>
                {ctaSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {ctaLabel(option)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Link de destino" hint="Obrigatório para liberar a publicação.">
              <input className={inputClass} value={link} onChange={(event) => setLink(event.target.value)} />
            </Field>
          </div>
          <Field label="Rastreio do link (UTMs)" hint="Ex.: utm_source=instagram. Vazio usa o padrão do cliente.">
            <input className={inputClass} value={urlTags} onChange={(event) => setUrlTags(event.target.value)} />
          </Field>
        </fieldset>

        <section className="ap-ficha__checks" aria-labelledby={`${titleId}-val`}>
          <h3 id={`${titleId}-val`} className="ap-t-section">
            Validação do anúncio
          </h3>
          {!item.validation ? (
            <p className="ap-t-small ap-ficha__muted">Aguardando validação do lote.</p>
          ) : pendencias.length === 0 ? (
            <p className="ap-t-small ap-ficha__muted">Sem erros nem avisos neste anúncio.</p>
          ) : (
            <ul className="ap-ficha__issues">
              {pendencias.map((issue) => (
                <li key={issue.chave} data-tipo={issue.tipo}>
                  <span className="ap-t-body-strong">{issue.message}</span>
                  <span className="ap-t-small ap-ficha__muted">
                    {referencia}
                    {issue.campo ? ` · campo ${issue.campo}` : ''}
                    {issue.fix ? ` · Como resolver: ${issue.fix}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {errorMessage ? (
          <p role="alert" className="ap-ficha__alert" data-tone="danger">
            {errorMessage}
          </p>
        ) : null}
        {showDiscard ? (
          <div className="ap-ficha__alert" data-tone="warn" role="alert">
            <p>Você tem alterações não salvas. Descartar e fechar o editor?</p>
            <div className="ap-ficha__actions">
              <Button variant="secondary" size="sm" label="Continuar editando" onClick={() => setShowDiscard(false)} />
              <Button variant="destructive" size="sm" label="Descartar alterações" onClick={onSaved} />
            </div>
          </div>
        ) : null}

        <footer className="ap-ficha__foot">
          <p className="ap-t-small ap-ficha__muted">
            Salvar derruba a aprovação do lote: você valida de novo antes de publicar.
            {dirty ? ' Há alterações ainda não salvas.' : ''}
          </p>
          <div className="ap-ficha__actions">
            <Button variant="ghost" label="Cancelar" onClick={requestClose} isDisabled={isSaving} />
            <Button variant="primary" label={isSaving ? 'Salvando...' : 'Salvar item'} type="submit" isDisabled={isSaving} />
          </div>
        </footer>
      </form>
    </Dialog>
  );
}
