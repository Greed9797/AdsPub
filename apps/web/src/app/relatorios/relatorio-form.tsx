"use client";

import { useState, type FormEvent } from 'react';
import { Badge, Field, inputClass } from '@/components/ui';
import { confirmarImportacao, enviarRelatorio, type ReportPreview } from './actions';
import { Button } from '@astryxdesign/core/Button';

type Props = { clientId: string };

/** T-003-3: upload → prévia com erros por linha → confirmar. Sem chute. */
export function RelatorioForm({ clientId }: Props) {
  const [preview, setPreview] = useState<(ReportPreview & { ok: true }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setSalvo(null);
    setBusy(true);
    try {
      const result = await enviarRelatorio(new FormData(event.currentTarget));
      if ('erro' in result) {
        setErro(result.erro);
        return;
      }
      setPreview(result);
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await confirmarImportacao(preview.import_id);
      if ('erro' in result) {
        setErro(result.erro);
        return;
      }
      setSalvo(`${result.observations} observação(ões) confirmadas.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onUpload} className="grid gap-3 md:grid-cols-3" encType="multipart/form-data">
        <input type="hidden" name="client_id" value={clientId} />
        <Field label="Arquivo CSV ou XLSX">
          <input type="file" name="file" required accept=".csv,.xlsx,.xls" disabled={busy} className={inputClass} />
        </Field>
        <Field label="Moeda">
          <input name="currency" defaultValue="BRL" required disabled={busy} className={inputClass} />
        </Field>
        <Field label="Timezone">
          <input name="timezone" defaultValue="America/Sao_Paulo" required disabled={busy} className={inputClass} />
        </Field>
        <Field label="Nível">
          <select name="entity_level" defaultValue="ad" disabled={busy} className={inputClass}>
            <option value="account">Conta</option>
            <option value="campaign">Campanha</option>
            <option value="adset">Conjunto</option>
            <option value="ad">Anúncio</option>
          </select>
        </Field>
        <Field label="Atribuição">
          <input name="attribution" defaultValue="7d_click" required disabled={busy} className={inputClass} />
        </Field>
        <Field label="Cobertura">
          <select name="coverage" defaultValue="unknown" disabled={busy} className={inputClass}>
            <option value="all">Completa</option>
            <option value="selected">Selecionados</option>
            <option value="unknown">Desconhecida</option>
          </select>
        </Field>
        <div className="flex items-end md:col-span-3">
          <Button variant="primary" label={busy ? 'Enviando...' : 'Enviar e pré-visualizar'} type="submit" isDisabled={busy} />
        </div>
        {erro ? <p className="text-sm text-[var(--color-danger)] md:col-span-3">{erro}</p> : null}
      </form>

      {preview ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="ok">{preview.valid} válida(s)</Badge>
            <Badge tone={preview.invalid > 0 ? 'warn' : 'ok'}>{preview.invalid} inválida(s)</Badge>
            {preview.unmapped.length > 0 ? (
              <span className="text-xs text-[var(--color-muted)]">
                Sem mapeamento: {preview.unmapped.join(', ')}
              </span>
            ) : null}
          </div>
          <ul className="space-y-2">
            {preview.rows.map((row) => (
              <li
                key={row.row_number}
                className="rounded-lg border border-[var(--color-border)] p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">Linha {row.row_number}</span>
                  <Badge tone={row.status === 'valid' ? 'ok' : 'danger'}>{row.status}</Badge>
                  {row.observation ? (
                    <span className="text-xs text-[var(--color-muted)]">
                      {row.observation.grain}
                      {row.observation.adId ? ` · ${row.observation.adId}` : ' · sem ID'}
                    </span>
                  ) : null}
                </div>
                {row.errors.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-xs text-[var(--color-danger)]">
                    {row.errors.map((e, i) => (
                      <li key={i}>
                        {e.code} ({e.field}): {e.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Button variant="secondary" label={busy ? 'Confirmando...' : `Confirmar ${preview.valid} observação(ões)`} isDisabled={busy} onClick={onCommit} />
            {salvo ? <p className="text-sm text-[var(--color-ok)]">{salvo}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
