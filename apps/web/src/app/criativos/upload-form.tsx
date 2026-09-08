"use client";

import { useState, type FormEvent } from 'react';
import { Badge, buttonClass, Field, inputClass, secondaryButtonClass } from '@/components/ui';
import { enviarCriativos, type UploadCriativosResult } from './actions';
import type { Asset } from '@/lib/types';

type UploadFormState = UploadCriativosResult | null;

type UploadFormProps = {
  clientId: string;
};

function fileResultLabel(asset: Asset): string {
  return asset.validation.status === 'ok' ? 'Aceito' : 'Rejeitado';
}

function formatMegabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

export function UploadForm({ clientId }: UploadFormProps) {
  const [state, setState] = useState<UploadFormState>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setSaving(true);
    try {
      const result = await enviarCriativos(formData);
      setState(result);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold">Upload de criativos</h2>
      <form onSubmit={onSubmit} className="mt-3 space-y-3" encType="multipart/form-data">
        <input type="hidden" name="client_id" value={clientId} />

        <Field label="Arquivos">
          <input
            type="file"
            name="files"
            multiple
            required
            disabled={saving}
            className={inputClass}
          />
        </Field>

        <div className="flex items-center gap-2">
          <button type="submit" className={buttonClass} disabled={saving}>
            {saving ? 'Enviando...' : 'Enviar para fila'}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => setState(null)}
            disabled={saving}
          >
            Limpar resultado
          </button>
        </div>
      </form>

      {state && 'erro' in state ? (
        <p className="mt-3 rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-2 text-sm text-[var(--color-danger)]">
          {state.erro}
        </p>
      ) : null}

      {state && 'sucesso' in state ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-[var(--color-muted)]">Resultado por arquivo:</p>
          <ul className="space-y-2">
            {state.assets.map((asset) => (
              <li key={asset.id} className="rounded border border-[var(--color-border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">{asset.filename}</span>
                  <Badge tone={asset.validation.status === 'ok' ? 'ok' : 'danger'}>
                    {fileResultLabel(asset)}
                  </Badge>
                </div>

                <div className="mt-2 text-sm text-[var(--color-muted)]">
                  <span>{asset.mime}</span>
                  <span className="mx-2">·</span>
                  <span>{formatMegabytes(asset.size_bytes)} MB</span>
                </div>

                {asset.validation.status === 'rejected' ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-[var(--color-muted)]">Validação:</p>
                    <ul className="list-disc space-y-1 pl-5 text-xs">
                      {asset.validation.errors.map((error, index) => (
                        <li key={`${asset.id}-error-${index}`}>
                          <p className="text-[var(--color-danger)]">{error.message}</p>
                          {error.fix ? <p className="text-[var(--color-muted)]">Solução: {error.fix}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
