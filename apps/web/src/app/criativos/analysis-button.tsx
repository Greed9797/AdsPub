"use client";

import { useState } from 'react';
import { Badge } from '@/components/ui';
import { analisarCriativo, type AnalysisView } from './actions';
import { Button } from '@astryxdesign/core/Button';

/** T-006-2: dispara a análise visual e mostra os achados com evidências. */
export function AnalysisButton({ assetId }: { assetId: string }) {
  const [analysis, setAnalysis] = useState<AnalysisView | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onAnalyze() {
    setBusy(true);
    setErro(null);
    try {
      const result = await analisarCriativo(assetId);
      if ('erro' in result) {
        setErro(result.erro);
        return;
      }
      setAnalysis(result.analysis);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" label={busy ? 'Analisando...' : 'Analisar conteúdo'} isDisabled={busy} onClick={onAnalyze} />
      {erro ? <p className="text-xs text-[var(--color-danger)]">{erro}</p> : null}
      {analysis ? (
        <div className="space-y-1">
          <p className="text-xs text-[var(--color-muted)]">
            {analysis.model_id} · revisão {analysis.revision}
          </p>
          <ul className="space-y-1">
            {analysis.findings.observations.map((obs, i) => (
              <li key={i} className="text-xs">
                <Badge tone="info">{obs.tipo}</Badge>{' '}
                <span className="text-[var(--color-muted)]">{obs.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
