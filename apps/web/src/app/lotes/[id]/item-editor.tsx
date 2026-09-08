'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ctaSchema } from '@adpub/shared';

import { buttonClass, inputClass, secondaryButtonClass, Field } from '@/components/ui';
import type { AdDraft, Copy } from '@/lib/types';
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
  salvarItemAction: (payload: SalvarItemPayload) => Promise<ActionResult<AdDraft>>;
  onSaved: () => void;
};

export function ItemEditor({ batchId, item, salvarItemAction, onSaved }: ItemEditorProps) {
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
    <form
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
      onSubmit={handleSubmit}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome do anúncio">
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Página (page_id)">
          <input className={inputClass} value={pageId} onChange={(event) => setPageId(event.target.value)} />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Instagram (ig_user_id)" hint="Vazio publica apenas na página do Facebook.">
          <input className={inputClass} value={igUserId} onChange={(event) => setIgUserId(event.target.value)} />
        </Field>
        <Field label="CTA">
          <select className={inputClass} value={cta} onChange={(event) => setCta(event.target.value)}>
            {ctaSchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Texto principal">
        <textarea
          className={`${inputClass} h-24`}
          value={primaryText}
          maxLength={2000}
          onChange={(event) => setPrimaryText(event.target.value)}
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
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

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Link" hint="Vazio mantém o item bloqueado na validação.">
          <input className={inputClass} value={link} onChange={(event) => setLink(event.target.value)} />
        </Field>
        <Field label="UTMs (url_tags)">
          <input className={inputClass} value={urlTags} onChange={(event) => setUrlTags(event.target.value)} />
        </Field>
      </div>

      {errorMessage ? <p className="text-sm text-[var(--color-danger)]">{errorMessage}</p> : null}

      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar item'}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={isSaving}
          onClick={() => {
            setName(item.name);
            setPageId(item.page_id);
            setIgUserId(item.ig_user_id ?? '');
            setPrimaryText(item.copy.primary_text);
            setHeadline(item.copy.headline);
            setDescription(item.copy.description);
            setCta(item.copy.cta);
            setLink(item.copy.link);
            setUrlTags(item.copy.url_tags);
            setErrorMessage(undefined);
          }}
        >
          Restaurar
        </button>
      </div>
    </form>
  );
}
