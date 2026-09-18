"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { Card, Field, inputClass } from '@/components/ui';
import {
  acompanharImportacaoDrive,
  importarDoDrive,
  type DriveImportJobView,
  type ImportarDriveResult,
} from './actions';
import { Button } from '@astryxdesign/core/Button';

/** Enquanto o worker roda, a tela mostra em que pé está o job — mesmo padrão do botão de análise. */
const STATUS_LABEL: Record<DriveImportJobView['status'], string> = {
  queued: 'Na fila de importação…',
  running: 'Importando do Drive…',
  done: 'Importação concluída',
  failed: 'A importação falhou',
};

const POLL_MS = 2000;

type DriveImportFormProps = {
  clientId: string;
};

export function DriveImportForm({ clientId }: DriveImportFormProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [job, setJob] = useState<DriveImportJobView | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'failed') return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const result = await acompanharImportacaoDrive(job.job_id);
      if (cancelled) return;
      if ('erro' in result) {
        setErro(result.erro);
        return;
      }
      setJob(result.job);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [job?.job_id, job?.status]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setSaving(true);
    setErro(null);
    try {
      const result: ImportarDriveResult = await importarDoDrive(formData);
      if ('erro' in result) {
        setErro(result.erro);
        return;
      }
      setJob(result.job);
    } finally {
      setSaving(false);
    }
  }

  const running = job?.status === 'queued' || job?.status === 'running';

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
            disabled={saving || running}
            className={inputClass}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <input
            type="checkbox"
            name="recursive"
            defaultChecked
            value="on"
            disabled={saving || running}
          />
          <span>Importar subpastas também</span>
        </label>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            label={saving ? 'Iniciando...' : running ? STATUS_LABEL[job!.status] : 'Iniciar importação'}
            type="submit"
            isDisabled={saving || running}
          />
          <Button
            variant="secondary"
            label="Limpar resultado"
            isDisabled={saving || running}
            onClick={() => {
              setJob(null);
              setErro(null);
            }}
          />
        </div>
      </form>

      {erro ? (
        <p className="mt-3 rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-2 text-sm text-[var(--color-danger)]">
          {erro}
        </p>
      ) : null}

      {job ? (
        <div className="mt-4 space-y-1 rounded border border-[var(--color-border)] p-3 text-sm">
          <p role="status">
            {STATUS_LABEL[job.status]} {job.imported} novos · {job.reused} reaproveitados
            {job.rejected.length > 0 ? ` · ${job.rejected.length} rejeitados` : ''}.
          </p>
          {job.status === 'failed' && job.error ? (
            <p className="text-sm text-[var(--color-danger)]">{job.error}</p>
          ) : null}
          {job.rejected.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--color-muted)]">
              {job.rejected.slice(0, 5).map((item) => (
                <li key={`${job.job_id}-${item.filename}`}>
                  {item.filename}: {item.reason}
                </li>
              ))}
              {job.rejected.length > 5 ? (
                <li>e mais {job.rejected.length - 5} arquivos…</li>
              ) : null}
            </ul>
          ) : null}
          {job.status === 'done' ? (
            <p className="text-xs text-[var(--color-muted)]">
              A biblioteca recarrega sozinha — os criativos já estão validados acima.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
