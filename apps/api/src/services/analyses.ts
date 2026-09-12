import type { ContentAnalysis } from '@adpub/creative-intel';
import {
  audit,
  getAnalysisById,
  insertAnalysis,
  supersedeAnalysis,
  type ContentAnalysisRow,
} from '@adpub/db';
import { notFound } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

/**
 * A9: a análise de mídia saiu daqui. Quem roda ffmpeg e IA é o worker
 * (`@adpub/worker/analysis/run`), a partir de um job persistido; a API só
 * enfileira, acompanha o estado e mantém a correção humana.
 */

/** Correção humana = nova revisão; original preservado. */
export async function correctAnalysis(
  deps: ApiDeps,
  actor: { id?: string | null; email?: string | null },
  analysisId: string,
  findings: ContentAnalysis,
): Promise<ContentAnalysisRow> {
  const current = await getAnalysisById(deps.db, analysisId);
  if (!current) throw notFound(`Análise ${analysisId} não encontrada.`);
  const revision = await insertAnalysis(deps.db, {
    assetId: current.assetId,
    assetSha: current.assetSha,
    promptVersion: current.promptVersion,
    modelId: 'human-correction',
    schemaVersion: current.schemaVersion,
    inputHash: `${current.inputHash}:rev${current.revision + 1}`,
    findings,
    coverage: current.coverage,
    costUsd: '0',
    latencyMs: 0,
    revision: current.revision + 1,
  });
  await supersedeAnalysis(deps.db, current.id, revision.id);
  await audit(deps.db, {
    actor,
    action: 'content.correct',
    entityType: 'content_analysis',
    entityId: revision.id,
    before: { supersedes: current.id },
  });
  return revision;
}
