"use client";

import { useState, type FormEvent } from 'react';
import { Card, Field, inputClass } from '@/components/ui';
import { importarDoDrive, type ImportarDriveResult } from './actions';
import { Button } from '@astryxdesign/core/Button';

type DriveImportState = ImportarDriveResult | null;

type DriveImportFormProps = {
  clientId: string;
};

export function DriveImportForm({ clientId }: DriveImportFormProps) {
  const [state, setState] = useState<DriveImportState>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setSaving(true);
    try {
      const result = await importarDoDrive(formData);
      setState(result);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Importar do Google Drive">
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="client_id" value={clientId} />

        <Field label="URL da pasta">
          <input
            type="url"
            name="folder_url"
            required
            placeholder="https://drive.google.com/drive/folders/..."
            disabled={saving}
            className={inputClass}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <input type="checkbox" name="recursive" defaultChecked value="on" disabled={saving} />
          <span>Importar subpastas também</span>
        </label>

        <div className="flex items-center gap-2">
          <Button variant="primary" label={saving ? 'Iniciando...' : 'Iniciar importação'} type="submit" isDisabled={saving} />
          <Button variant="secondary" label="Limpar resultado" isDisabled={saving} onClick={() => setState(null)} />
        </div>
      </form>

      {state && 'erro' in state ? (
        <p className="mt-3 rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-2 text-sm text-[var(--color-danger)]">
          {state.erro}
        </p>
      ) : null}

      {state && 'sucesso' in state ? (
        <div className="mt-4 rounded border border-[var(--color-border)] p-3 text-sm">
          <p>
            Importação enviada para a fila <span className="font-semibold">{state.queue}</span> com sucesso.
          </p>
          <p className="mt-1">
            <span className="font-semibold">Job:</span> {state.job_id}
          </p>
          <p className="mt-2 text-[var(--color-muted)]">
            O processo roda em fila e o resultado aparecerá quando a sincronização terminar.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
