"use client";

import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Selo, inputClass } from '@/components/ui';
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
    <Card title="Upload de criativos">
      <form onSubmit={onSubmit} className="ap-side-form" encType="multipart/form-data">
        <input type="hidden" name="client_id" value={clientId} />

        <Field label="Arquivos" hint="Fotos ou vídeos do produto. Depois de enviar, eles aparecem na lista abaixo para validação.">
          <input
            type="file"
            name="files"
            multiple
            required
            disabled={saving}
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            className={inputClass}
          />
        </Field>

        <div className="ap-side-form__actions">
          <Button variant="primary" label={saving ? 'Enviando...' : 'Enviar para fila'} type="submit" isDisabled={saving} />
          <Button variant="secondary" label="Limpar resultado" isDisabled={saving} onClick={() => setState(null)} />
        </div>
      </form>

      {state && 'erro' in state ? (
        <p role="alert" className="ap-note" data-tone="danger">
          {state.erro}
        </p>
      ) : null}

      {state && 'sucesso' in state ? (
        <div className="ap-side-form__result">
          <p className="ap-t-small ap-side-form__muted">Resultado por arquivo:</p>
          <ul className="ap-side-form__list">
            {state.assets.map((asset) => (
              <li key={asset.id} className="ap-side-form__file">
                <div className="ap-side-form__row">
                  <span className="ap-t-ref">{asset.filename}</span>
                  <Selo tone={asset.validation.status === 'ok' ? 'publicado' : 'bloqueado'} label={fileResultLabel(asset)} />
                </div>

                <p className="ap-t-small ap-side-form__muted">{formatMegabytes(asset.size_bytes)} MB</p>

                {asset.validation.status === 'rejected' ? (
                  <div className="ap-midia__issues" data-tone="danger">
                    <p className="ap-t-small">Validação:</p>
                    <ul className="ap-t-small">
                      {asset.validation.errors.map((error, index) => (
                        <li key={`${asset.id}-error-${index}`}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {asset.validation.warnings.length > 0 ? (
                  <div className="ap-midia__issues" data-tone="warn">
                    <p className="ap-t-small">Avisos:</p>
                    <ul className="ap-t-small">
                      {asset.validation.warnings.map((warning, index) => (
                        <li key={`${asset.id}-warning-${index}`}>{warning}</li>
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
