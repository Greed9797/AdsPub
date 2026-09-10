import {
  audit,
  createBatch,
  getAccount,
  getLearning,
  getReport,
  insertLearning,
  listLearnings,
  patchLearning,
} from '@adpub/db';
import { notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { buildTestBriefing } from './test-briefing.js';

type Actor = { id?: string | null; email?: string | null };

/** T-008-1: salva aprendizado a partir do relatório, com origem e limites. */
export async function saveLearning(
  deps: ApiDeps,
  actor: Actor,
  input: {
    clientId: string;
    adAccountId?: string | null;
    sourceReportId: string;
    hypothesis: string;
    originVariantIds?: string[];
    evidence?: Record<string, unknown>;
    limitations?: string[];
    controlVariantId?: string | null;
    primaryMetric?: string | null;
    testConditions?: string | null;
  },
) {
  const report = await getReport(deps.db, input.sourceReportId);
  if (!report) throw notFound(`Relatório ${input.sourceReportId} não encontrado.`);
  const row = await insertLearning(deps.db, {
    clientId: input.clientId,
    adAccountId: input.adAccountId ?? report.adAccountId,
    sourceReportId: report.id,
    originVariantIds: input.originVariantIds ?? [],
    hypothesis: input.hypothesis,
    evidence: input.evidence ?? {},
    limitations: input.limitations ?? [],
    evidenceLevel: 'hypothesis',
    controlVariantId: input.controlVariantId ?? null,
    primaryMetric: input.primaryMetric ?? null,
    testConditions: input.testConditions ?? null,
    createdBy: actor.id ?? null,
  });
  await audit(deps.db, { actor, action: 'learning.save', entityType: 'learning', entityId: row.id });
  return row;
}

export async function learningBriefing(deps: ApiDeps, learningId: string) {
  const learning = await getLearning(deps.db, learningId);
  if (!learning) throw notFound(`Aprendizado ${learningId} não encontrado.`);
  const briefing = buildTestBriefing({
    hypothesis: learning.hypothesis,
    variable: learning.testConditions ?? 'abertura',
    keeps: [],
    goal: 'baixar CPA',
    metric: learning.primaryMetric ?? 'cpa',
    preconditions: [],
  });
  return { briefing, template: 'briefing_template.v1' };
}

/** T-008-2: rascunho vinculado ao aprendizado; aprovado segue PAUSED. */
export async function learningTestDraft(deps: ApiDeps, actor: Actor, learningId: string, briefing: string) {
  const learning = await getLearning(deps.db, learningId);
  if (!learning) throw notFound(`Aprendizado ${learningId} não encontrado.`);
  const account = learning.adAccountId ? await getAccount(deps.db, learning.adAccountId) : undefined;
  if (!account) throw unprocessable('Aprendizado sem conta.');
  const batch = await createBatch(deps.db, {
    clientId: learning.clientId,
    adAccountId: account.id,
    createdBy: actor.id ?? null,
    name: `Teste de aprendizado ${learning.id.slice(0, 8)}`,
    mode: 'manual',
    briefing,
    options: { initial_status: 'PAUSED', max_items: 200, dry_run: false },
    sourceReportId: learning.sourceReportId,
  });
  await patchLearning(deps.db, learning.id, { testBatchId: batch.id });
  await audit(deps.db, {
    actor,
    action: 'learning.test_draft',
    entityType: 'batch',
    entityId: batch.id,
    after: { learning_id: learning.id },
  });
  return { batch_id: batch.id };
}

const PROMOTIONS: Record<string, string[]> = {
  hypothesis: ['consistent_observation'],
  consistent_observation: ['controlled_test'],
  controlled_test: [],
};

/** Nível sobe só com registro; resultado negativo permanece. */
export async function recordOutcome(
  deps: ApiDeps,
  actor: Actor,
  learningId: string,
  input: {
    evidenceLevel?: string;
    activatedAt?: string | null;
    testDesign?: string | null;
    resultSummary?: string | null;
    outcome?: 'positive' | 'negative' | 'inconclusive' | null;
  },
) {
  const learning = await getLearning(deps.db, learningId);
  if (!learning) throw notFound(`Aprendizado ${learningId} não encontrado.`);
  if (input.evidenceLevel && !(PROMOTIONS[learning.evidenceLevel] ?? []).includes(input.evidenceLevel)) {
    throw unprocessable(`Nível ${learning.evidenceLevel} não promove para ${input.evidenceLevel}.`);
  }
  const updated = await patchLearning(deps.db, learning.id, {
    ...(input.evidenceLevel ? { evidenceLevel: input.evidenceLevel } : {}),
    ...(input.activatedAt !== undefined
      ? { activatedAt: input.activatedAt ? new Date(input.activatedAt) : null }
      : {}),
    ...(input.testDesign !== undefined ? { testDesign: input.testDesign } : {}),
    ...(input.resultSummary !== undefined ? { resultSummary: input.resultSummary } : {}),
    ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
  });
  await audit(deps.db, { actor, action: 'learning.outcome', entityType: 'learning', entityId: learning.id });
  return updated;
}

export async function listClientLearnings(deps: ApiDeps, clientId: string) {
  return listLearnings(deps.db, clientId);
}
