"use client";

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Field, Selo, inputClass } from '@/components/ui';
import { comentarRelatorio, gerarRascunho, gerarRelatorio, registrarResultado, salvarAprendizado, type ReportView } from './actions';

type Props = { accountId: string; clientId: string };

/** T-007-3/T-008: gerar → ver fatos/hipóteses/testes → comentar → rascunho. */
export function InteligenciaForm({ accountId, clientId }: Props) {
  const [report, setReport] = useState<(ReportView & { ok: true }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [briefing, setBriefing] = useState('');
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [hipotese, setHipotese] = useState('');
  const [aprendizado, setAprendizado] = useState<string | null>(null);
  const [resultado, setResultado] = useState('');
  const [outcome, setOutcome] = useState<'positive' | 'negative' | 'inconclusive'>('positive');

  async function onGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setBusy(true);
    try {
      const result = await gerarRelatorio(new FormData(event.currentTarget));
      if ('erro' in result) {
        setErro(result.erro);
        return;
      }
      setReport(result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-intel">
      <form onSubmit={onGenerate} className="ap-intel__form">
        <input type="hidden" name="ad_account_id" value={accountId} />
        <Field label="De">
          <input type="date" name="from" required disabled={busy} className={inputClass} />
        </Field>
        <Field label="Até">
          <input type="date" name="to" required disabled={busy} className={inputClass} />
        </Field>
        <Field label="Fonte">
          <select name="source" defaultValue="" disabled={busy} className={inputClass}>
            <option value="">Todas</option>
            <option value="file">Arquivo</option>
            <option value="api">API</option>
          </select>
        </Field>
        <div className="ap-intel__go">
          <Button variant="primary" label={busy ? 'Gerando...' : 'Gerar relatório'} type="submit" isDisabled={busy} />
        </div>
        {erro ? <p role="alert" className="ap-note ap-intel__wide" data-tone="danger">{erro}</p> : null}
      </form>

      {report ? (
        <div className="ap-intel">
          <p className="ap-t-small ap-passos__dica">
            Baseado em{' '}
            {report.input_snapshot.totals.spend.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}{' '}
            investidos no período.
          </p>
          <section>
            <h3 className="ap-t-body-strong">Fatos</h3>
            <ul className="ap-intel__list">
              {report.output.performance_findings.map((f, i) => (
                <li key={i}>{f.text}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="ap-t-body-strong">Hipóteses</h3>
            <ul className="ap-intel__hyp">
              {report.output.hypotheses.map((h, i) => (
                <li key={i}>
                  <p className="ap-intel__p">{h.text}</p>
                  <p className="ap-t-small ap-passos__dica ap-intel__p">Teste: {h.test}</p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="ap-t-body-strong">Próximos testes</h3>
            <ul className="ap-intel__list">
              {report.output.recommended_tests.map((t, i) => (
                <li key={i}>
                  {t.variable} → {t.goal} ({t.metric})
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="ap-t-body-strong">Limitações</h3>
            <ul className="ap-intel__list ap-passos__dica">
              {report.output.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>
          <section className="ap-intel__sec">
            <h3 className="ap-t-body-strong">Comentar</h3>
            <div className="ap-intel__row">
              <input
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Correção ou anotação"
                className={inputClass}
              />
              <Button variant="secondary" label="Comentar" isDisabled={busy || !feedback.trim()} onClick={() => {
                  setBusy(true);
                  void comentarRelatorio(report.id, feedback).then((r) => {
                    setBusy(false);
                    if ('erro' in r) setErro(r.erro);
                    else setFeedback('');
                  });
                }} />
            </div>
            {report.feedbacks.map((f) => (
              <p key={f.id} className="ap-t-small ap-passos__dica ap-intel__p">
                <Selo tone="neutro" label="nota" /> {f.text}
              </p>
            ))}
          </section>
          <section className="ap-intel__sec">
            <h3 className="ap-t-body-strong">Gerar rascunho de teste</h3>
            <div className="ap-intel__row">
              <input
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
                placeholder="Briefing do teste"
                className={inputClass}
              />
              <Button variant="secondary" label="Gerar rascunho" isDisabled={busy || !briefing.trim()} onClick={() => {
                  setBusy(true);
                  void gerarRascunho(report.id, briefing).then((r) => {
                    setBusy(false);
                    if ('erro' in r) setErro(r.erro);
                    else setRascunho(r.batch_id);
                  });
                }} />
            </div>
            {rascunho ? (
              <p role="status" className="ap-note ap-intel__p">
                Rascunho pronto (ainda não publicado).{' '}
                <Link href={`/lotes/${rascunho}`}>
                  Ver lote
                </Link>
              </p>
            ) : null}
          </section>
          <section className="ap-intel__sec">
            <h3 className="ap-t-body-strong">Salvar aprendizado</h3>
            <div className="ap-intel__row">
              <input
                value={hipotese}
                onChange={(e) => setHipotese(e.target.value)}
                placeholder="Hipótese em uma frase"
                className={inputClass}
              />
              <Button variant="secondary" label="Salvar" isDisabled={busy || !hipotese.trim()} onClick={() => {
                  setBusy(true);
                  void salvarAprendizado(report.id, clientId, hipotese).then((r) => {
                    setBusy(false);
                    if ('erro' in r) setErro(r.erro);
                    else setAprendizado(r.id);
                  });
                }} />
            </div>
            {aprendizado ? (
              <div className="ap-intel__row ap-intel__row--wrap">
                <p role="status" className="ap-note ap-intel__p">Aprendizado: {aprendizado}</p>
                <input
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                  placeholder="Resultado observado"
                  className={inputClass}
                />
                <select
                  value={outcome}
                  aria-label="Resultado do teste"
                  onChange={(e) => setOutcome(e.target.value as 'positive' | 'negative' | 'inconclusive')}
                  className={inputClass}
                >
                  <option value="positive">positivo</option>
                  <option value="negative">negativo</option>
                  <option value="inconclusive">inconclusivo</option>
                </select>
                <Button variant="secondary" label="Registrar resultado" isDisabled={busy || !resultado.trim()} onClick={() => {
                    setBusy(true);
                    void registrarResultado(aprendizado, resultado, outcome).then((r) => {
                      setBusy(false);
                      if ('erro' in r) setErro(r.erro);
                      else setResultado('');
                    });
                  }} />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
