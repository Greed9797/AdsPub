'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ctaSchema } from '@adpub/shared';

import { inputClass, Field, ctaLabel } from '@/components/ui';
import { AdPreview } from '@/components/ad-preview';
import { Dialog } from '@astryxdesign/core/Dialog';
import type { AdDraft, Asset, Copy } from '@/lib/types';
import type { ActionResult } from '../actions';
import { Button } from '@astryxdesign/core/Button';

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
  // Erros, avisos e política do próprio item: a validação já vem no item, só
  // não era mostrada onde a correção acontece.
  const pendencias = [
    ...(item.validation?.errors ?? []).map((issue) => ({
      chave: `erro-${issue.code}-${issue.field}`,
      message: issue.message,
      fix: issue.fix,
    })),
    ...(item.validation?.policy ?? []).map((issue, index) => ({
      chave: `politica-${issue.category}-${index}`,
      message: `${issue.category}: ${issue.excerpt}`,
      fix: '',
    })),
    ...(item.validation?.warnings ?? []).map((issue) => ({
      chave: `aviso-${issue.code}-${issue.field}`,
      message: issue.message,
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
      purpose="form"
      width={1080}
      maxHeight="90dvh"
      padding={5}
      aria-labelledby={titleId}
    >
      <form onSubmit={handleSubmit}>
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Editar anúncio
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">{item.name}</p>
          </div>
          <Button variant="secondary" label="Fechar" onClick={requestClose} isDisabled={isSaving} />
        </div>
        {/* O problema fica ao lado do campo que o resolve: sem isso o gestor
            vê "2 erros" na tabela e precisa adivinhar o que corrigir. */}
        {pendencias.length > 0 ? (
          <div className="notice notice-warning mb-5">
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {pendencias.map((issue) => (
                <li key={issue.chave}>
                  {issue.message}
                  {issue.fix ? ` — Como resolver: ${issue.fix}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="ad-editor-layout">
          <fieldset disabled={isSaving} className="min-w-0 space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Identidade do anúncio</h3>
              <Field label="Nome do anúncio">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Página do Facebook" hint="ID da página responsável pelo anúncio.">
                  <input
                    className={inputClass}
                    value={pageId}
                    onChange={(event) => setPageId(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Instagram" hint="Opcional. Vazio publica apenas no Facebook.">
                  <input
                    className={inputClass}
                    value={igUserId}
                    onChange={(event) => setIgUserId(event.target.value)}
                  />
                </Field>
              </div>
            </section>
            <section className="space-y-3 border-t border-[var(--color-border)] pt-4">
              <h3 className="text-sm font-semibold">Conteúdo do anúncio</h3>
              <Field label="Texto principal" hint={`${primaryText.length} de 2.000 caracteres`}>
                <textarea
                  className={`${inputClass} h-32`}
                  value={primaryText}
                  maxLength={2000}
                  onChange={(event) => setPrimaryText(event.target.value)}
                  required
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Título">
                  <input
                    className={inputClass}
                    value={headline}
                    maxLength={255}
                    onChange={(event) => setHeadline(event.target.value)}
                  />
                </Field>
                <Field label="Descrição">
                  <input
                    className={inputClass}
                    value={description}
                    maxLength={255}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
              </div>
            </section>
            <section className="space-y-3 border-t border-[var(--color-border)] pt-4">
              <h3 className="text-sm font-semibold">Destino e rastreamento</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Botão do anúncio">
                  <select
                    className={inputClass}
                    value={cta}
                    onChange={(event) => setCta(event.target.value)}
                  >
                    {ctaSchema.options.map((option) => (
                      <option key={option} value={option}>
                        {ctaLabel(option)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Link de destino" hint="Obrigatório para liberar a publicação.">
                  <input
                    className={inputClass}
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                  />
                </Field>
              </div>
              <Field
                label="Rastreio do link (UTMs)"
                hint="Ex.: utm_source=instagram. Vazio usa o padrão do cliente."
              >
                <input
                  className={inputClass}
                  value={urlTags}
                  onChange={(event) => setUrlTags(event.target.value)}
                />
              </Field>
            </section>
          </fieldset>
          <AdPreview
            pageLabel={pageId ? `Página ${pageId}` : ''}
            copy={{ primary_text: primaryText, headline, description, cta, link }}
            asset={assets.find((asset) => asset.id === item.asset_ids[0])}
            mediaCount={item.asset_ids.length}
          />
        </div>
        {errorMessage ? (
          <p role="alert" className="notice notice-error mt-4">
            {errorMessage}
          </p>
        ) : null}
        {showDiscard ? (
          <div className="notice notice-warning mt-4" role="alert">
            <div className="space-y-3">
              <p>Você tem alterações não salvas. Descartar e fechar o editor?</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  label="Continuar editando"
                  onClick={() => setShowDiscard(false)}
                />
                <Button variant="destructive" label="Descartar alterações" onClick={onSaved} />
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
          <p className="text-xs text-[var(--color-muted)]">
            {dirty ? 'Alterações ainda não salvas' : 'Nenhuma alteração pendente'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              label="Cancelar"
              onClick={requestClose}
              isDisabled={isSaving}
            />
            <Button
              variant="primary"
              label={isSaving ? 'Salvando...' : 'Salvar item'}
              type="submit"
              isDisabled={isSaving}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
