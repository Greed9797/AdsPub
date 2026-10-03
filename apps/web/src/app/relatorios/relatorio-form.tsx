"use client";

import { useState, type FormEvent } from 'react';
import { Button, Field, Selo, inputClass } from '@/components/ui';
import { confirmarImportacao, enviarRelatorio, type ReportPreview } from './actions';

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
    <div className="ap-intel">
      <form onSubmit={onUpload} className="ap-intel__form ap-intel__form--3" encType="multipart/form-data">
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
        <div className="ap-intel__wide">
          <Button variant="primary" label={busy ? 'Enviando...' : 'Enviar e pré-visualizar'} type="submit" isDisabled={busy} />
        </div>
        {erro ? <p role="alert" className="ap-note ap-intel__wide" data-tone="danger">{erro}</p> : null}
      </form>

      {preview ? (
        <div className="ap-intel">
          <div className="ap-intel__row ap-intel__row--wrap">
            <Selo tone="publicado">{preview.valid} válida(s)</Selo>
            <Selo tone={preview.invalid > 0 ? 'rascunho' : 'publicado'}>{preview.invalid} inválida(s)</Selo>
            {preview.unmapped.length > 0 ? (
              <span className="ap-t-small ap-passos__dica">
                Sem mapeamento: {preview.unmapped.join(', ')}
              </span>
            ) : null}
          </div>
          <ul className="ap-intel__hyp">
            {preview.rows.map((row) => (
              <li key={row.row_number} className="ap-intel__linha">
                <div className="ap-intel__row ap-intel__row--wrap">
                  <span className="ap-t-body-strong">Linha {row.row_number}</span>
                  <Selo tone={row.status === 'valid' ? 'publicado' : 'bloqueado'} label={row.status} />
                  {row.observation ? (
                    <span className="ap-t-small ap-passos__dica">
                      {row.observation.grain}
                      {row.observation.adId ? ` · ${row.observation.adId}` : ' · sem ID'}
                    </span>
                  ) : null}
                </div>
                {row.errors.length > 0 ? (
                  <ul className="ap-intel__erros ap-t-small">
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
          <p className="ap-note">A importação só vale depois de confirmar: até lá, nenhuma observação entra nos números.</p>
          <div className="ap-intel__row ap-intel__row--wrap">
            <Button variant="secondary" label={busy ? 'Confirmando...' : `Confirmar ${preview.valid} observação(ões)`} isDisabled={busy} onClick={onCommit} />
            {salvo ? <p role="status" className="ap-note">{salvo}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
