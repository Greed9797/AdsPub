import { costUsd } from '@adpub/ai';
import {
  REPORT_PROMPT_VERSION,
  REPORT_SCHEMA,
  REPORT_SCHEMA_VERSION,
  buildReportSnapshot,
  loadReportPrompt,
  validateReportOutput,
  type ReportOutput,
} from '@adpub/creative-intel';
import {
  addFeedback,
  audit,
  createBatch,
  getAccount,
  getClient,
  getReport,
  insertReport,
  listCurrentAnalysesForClient,
  listFeedbacks,
  type AnalysisReportRow,
} from '@adpub/db';
import { notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { getPerformance } from './performance.js';

export interface GenerateReportInput {
  adAccountId: string;
  from: string;
  to: string;
  source?: 'file' | 'api';
}

/** T-007-2: monta snapshot, chama IA, valida, persiste imutável. */
export async function generateReport(
  deps: ApiDeps,
  actor: { id?: string | null; email?: string | null },
  input: GenerateReportInput,
): Promise<AnalysisReportRow> {
  if (!deps.ai) throw unprocessable('IA indisponível no ambiente.');
  const account = await getAccount(deps.db, input.adAccountId);
  if (!account) throw notFound(`Conta ${input.adAccountId} não encontrada.`);
  if (!account.clientId) throw unprocessable(`Conta ${input.adAccountId} sem cliente.`);

  const perf = await getPerformance(deps, {
    adAccountId: input.adAccountId,
    from: input.from,
    to: input.to,
    ...(input.source ? { source: input.source } : {}),
  });
  // Uma consulta só: antes era uma por criativo, até 50.
  const analyses = await listCurrentAnalysesForClient(deps.db, account.clientId);
  const content = analyses.map((row) => ({
    assetId: row.assetId,
    observations: row.findings.observations.map((o) => ({ tipo: o.tipo, texto: o.texto })),
  }));

  const built = buildReportSnapshot({
    accountId: input.adAccountId,
    from: input.from,
    to: input.to,
    source: input.source ?? 'all',
    totals: { spend: perf.totals.spend, results: perf.totals.results },
    rows: perf.rows.map((r) => ({ id: r.id, name: r.name, spend: r.spend, results: r.results, cpa: r.cpa })),
    content,
    selectionCoverage: input.source ? 'selected' : 'all',
  });
  const snapshot = built.snapshot;

  const { invoke, model } = deps.ai.contentBackend();
  const started = Date.now();
  const promptVersion = REPORT_PROMPT_VERSION;
  const result = await invoke({
    model,
    system: loadReportPrompt(promptVersion),
    prompt: `Snapshot (verdade única, não recalcule):\n${built.json}`,
    toolName: 'submit_analysis_report',
    toolDescription: 'Devolve fatos, hipóteses, testes e limitações com evidências. Sem causalidade prometida.',
    inputSchema: REPORT_SCHEMA as unknown as Record<string, unknown>,
    timeoutMs: 120_000,
  });
  const output = result.input as ReportOutput;
  const issues = validateReportOutput(output, snapshot);
  if (issues.length > 0) {
    throw unprocessable(`Relatório bloqueado: ${issues.join(' | ').slice(0, 500)}`);
  }
  const latencyMs = Date.now() - started;
  const row = await insertReport(deps.db, {
    clientId: account.clientId,
    adAccountId: account.id,
    filter: { from: input.from, to: input.to, source: input.source ?? 'all', level: 'ad' },
    inputSnapshot: snapshot,
    output,
    modelId: model,
    promptVersion,
    schemaVersion: REPORT_SCHEMA_VERSION,
    costUsd: String(costUsd(model, result.inputTokens, result.outputTokens)),
    latencyMs,
    version: 1,
  });
  await audit(deps.db, {
    actor,
    action: 'report.generate',
    entityType: 'analysis_report',
    entityId: row.id,
  });
  return row;
}

export async function addReportFeedback(
  deps: ApiDeps,
  actor: { id?: string | null; email?: string | null },
  reportId: string,
  text: string,
): Promise<void> {
  const report = await getReport(deps.db, reportId);
  if (!report) throw notFound(`Relatório ${reportId} não encontrado.`);
  await addFeedback(deps.db, reportId, actor.id ?? null, text);
  await audit(deps.db, { actor, action: 'report.feedback', entityType: 'analysis_report', entityId: reportId });
}

export async function reportDetails(deps: ApiDeps, reportId: string) {
  const report = await getReport(deps.db, reportId);
  if (!report) throw notFound(`Relatório ${reportId} não encontrado.`);
  const feedbacks = await listFeedbacks(deps.db, reportId);
  return { ...reportDto(report), feedbacks: feedbacks.map((f) => ({ id: f.id, text: f.text })) };
}

/** T-007-2c/008-01: teste é rascunho — lote draft com briefing, zero Meta. */
export async function createTestDraft(
  deps: ApiDeps,
  actor: { id?: string | null; email?: string | null },
  reportId: string,
  briefing: string,
) {
  const report = await getReport(deps.db, reportId);
  if (!report) throw notFound(`Relatório ${reportId} não encontrado.`);
  if (!report.adAccountId || !report.clientId) throw unprocessable('Relatório sem conta/cliente.');
  const client = await getClient(deps.db, report.clientId);
  const batch = await createBatch(deps.db, {
    clientId: report.clientId,
    adAccountId: report.adAccountId,
    createdBy: actor.id ?? null,
    name: `Teste de ${reportId.slice(0, 8)}`,
    mode: 'manual',
    briefing,
    options: { initial_status: 'PAUSED', max_items: 200, dry_run: false },
    sourceReportId: reportId,
  });
  await audit(deps.db, {
    actor,
    action: 'report.test_draft',
    entityType: 'batch',
    entityId: batch.id,
    after: { source_report_id: reportId },
  });
  return { batch_id: batch.id, client_voice: client?.voiceProfile ?? null };
}

export function reportDto(row: AnalysisReportRow) {
  return {
    id: row.id,
    client_id: row.clientId,
    ad_account_id: row.adAccountId,
    filter: row.filter,
    input_snapshot: row.inputSnapshot,
    output: row.output,
    model_id: row.modelId,
    prompt_version: row.promptVersion,
    schema_version: row.schemaVersion,
    cost_usd: row.costUsd,
    version: row.version,
    supersedes: row.supersedes,
  };
}
