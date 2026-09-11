"use client";

import { useState, type FormEvent } from 'react';
import { Badge, Card, Field, inputClass } from '@/components/ui';
import { enviarCriativos, type UploadCriativosResult } from './actions';
import type { Asset } from '@/lib/types';
import { Button } from '@astryxdesign/core/Button';

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
    <Card title="Upload de criativos">
      <form onSubmit={onSubmit} className="space-y-3" encType="multipart/form-data">
        <input type="hidden" name="client_id" value={clientId} />

        <Field label="Arquivos" hint="Fotos ou vídeos do produto. Depois de enviar, eles aparecem na lista abaixo para validação.">
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
          <Button variant="primary" label={saving ? 'Enviando...' : 'Enviar para fila'} type="submit" isDisabled={saving} />
          <Button variant="secondary" label="Limpar resultado" isDisabled={saving} onClick={() => setState(null)} />
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
    </Card>
  );
}
