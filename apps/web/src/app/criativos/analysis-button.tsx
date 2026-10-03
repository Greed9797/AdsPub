"use client";

import { useEffect, useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { acompanharAnalise, analisarCriativo, type AnalysisView } from './actions';

/** A9: enquanto o worker roda, a tela mostra em que pé está o job. */
const STATUS_LABEL: Record<string, string> = {
  queued: 'Na fila de análise…',
  running: 'Analisando o criativo…',
};

const POLL_MS = 2000;

export function AnalysisButton({ assetId }: { assetId: string }) {
  const [analysis, setAnalysis] = useState<AnalysisView | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!jobId || status === 'done' || status === 'failed') return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const result = await acompanharAnalise(jobId);
      if (cancelled) return;
      if ('erro' in result) {
        setErro(result.erro);
        return;
      }
      setStatus(result.job.status);
      if (result.job.status === 'done') setAnalysis(result.job.analysis);
      if (result.job.status === 'failed') {
        setErro(result.job.error ?? 'A análise falhou.');
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, status]);

  async function onAnalyze() {
    setBusy(true);
    setErro(null);
    setAnalysis(null);
    try {
      const result = await analisarCriativo(assetId);
      if ('erro' in result) {
        setErro(result.erro);
        return;
      }
      setJobId(result.job_id);
      setStatus(result.status);
    } finally {
      setBusy(false);
    }
  }

  const running = status === 'queued' || status === 'running';

  return (
    <div className="ap-analise">
      <Button
        variant="secondary"
        size="sm"
        label={busy ? 'Enviando…' : running ? (STATUS_LABEL[status!] ?? 'Analisando…') : 'Analisar conteúdo'}
        isDisabled={busy || running}
        onClick={onAnalyze}
      />
      {erro ? <p className="ap-t-small ap-analise__erro">{erro}</p> : null}
      {analysis ? (
        <div className="ap-analise__out">
          <p className="ap-t-small ap-analise__muted">
            {analysis.model_id} · revisão {analysis.revision}
          </p>
          <ul className="ap-analise__list">
            {analysis.findings.observations.map((obs, i) => (
              <li key={i} className="ap-t-small">
                <Badge tone="info">{obs.tipo}</Badge>{' '}
                <span className="ap-analise__muted">{obs.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
