import {
  analyzeContent,
  contentInputHash,
  sampleVideo,
  unavailableTranscriber,
  type ContentAnalysis,
} from '@adpub/creative-intel';
import {
  audit,
  findAnalysisByInput,
  getAnalysisById,
  getAssetsByIds,
  insertAnalysis,
  supersedeAnalysis,
  type ContentAnalysisRow,
} from '@adpub/db';
import { notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

export interface AnalysisInput {
  brandContext?: string;
  force?: boolean;
}

/**
 * T-006-2: análise de conteúdo versionada. Imagem = 1 frame; vídeo =
 * amostragem. Transcrição indisponível fica visível (sem provedor aprovado).
 */
export async function analyzeAsset(
  deps: ApiDeps,
  actor: { id?: string | null; email?: string | null },
  assetId: string,
  input: AnalysisInput = {},
): Promise<{ analysis: ContentAnalysisRow; cached: boolean }> {
  if (!deps.ai) throw unprocessable('IA indisponível no ambiente.');
  const [asset] = await getAssetsByIds(deps.db, [assetId]);
  if (!asset) throw notFound(`Criativo ${assetId} não encontrado.`);
  const bytes = await deps.storage.get(asset.storageKey);

  const frames =
    asset.kind === 'video'
      ? (await sampleVideo(bytes, asset.filename)).frames
      : [{ t: 0, jpeg: bytes }];
  const transcript = await unavailableTranscriber('sem provedor de transcrição aprovado').transcribe(
    new Uint8Array(),
    'pt-BR',
  );
  const { invoke, model } = deps.ai.contentBackend();
  const inputHash = contentInputHash(asset.sha256, frames.length);

  if (!input.force) {
    const cached = await findAnalysisByInput(deps.db, asset.id, inputHash);
    if (cached) return { analysis: cached, cached: true };
  }
  const { analysis, meta } = await analyzeContent(invoke, model, {
    assetSha256: asset.sha256,
    frames,
    transcript,
    brandContext: input.brandContext ?? '',
    filename: asset.filename,
  });
  const row = await insertAnalysis(deps.db, {
    assetId: asset.id,
    assetSha: asset.sha256,
    promptVersion: meta.promptVersion,
    modelId: meta.model,
    schemaVersion: meta.schemaVersion,
    inputHash: meta.inputHash,
    findings: analysis,
    coverage: {
      observed: frames.map((f) => [f.t, f.t] as [number, number]),
      transcript: transcript.status,
    },
    costUsd: String(meta.costUsd),
    latencyMs: meta.latencyMs,
    revision: 1,
  });
  await audit(deps.db, {
    actor,
    action: 'content.analyze',
    entityType: 'asset',
    entityId: asset.id,
    after: { analysis_id: row.id, model: meta.model, cost_usd: meta.costUsd },
  });
  return { analysis: row, cached: false };
}

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
