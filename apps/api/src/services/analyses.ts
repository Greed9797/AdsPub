import {
  CONTENT_PROMPT_VERSION,
  SAMPLE_LIMITS,
  analyzeContent,
  contentInputHash,
  sampleTimestamps,
  sampleVideo,
  unavailableTranscriber,
  type ContentAnalysis,
} from '@adpub/creative-intel';
import { makeVisionFrame } from '@adpub/media';
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
/**
 * A5: limites conferidos por metadado, antes de baixar o original. Arquivo
 * sabidamente fora do teto falha sem gastar download nem ffmpeg.
 */
export function assertAnalysisEligible(asset: {
  sizeBytes: number;
  durationMs?: number | null;
}): void {
  if (asset.sizeBytes > SAMPLE_LIMITS.maxBytes) {
    throw unprocessable(
      `Criativo com ${(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB excede o limite de ${SAMPLE_LIMITS.maxBytes / 1024 / 1024} MB para análise.`,
    );
  }
  if (asset.durationMs && asset.durationMs > SAMPLE_LIMITS.maxDurationMs) {
    throw unprocessable(
      `Vídeo com ${Math.round(asset.durationMs / 1000)}s excede o limite de ${SAMPLE_LIMITS.maxDurationMs / 1000}s para análise.`,
    );
  }
}

/**
 * A5: os instantes que a amostragem vai usar, derivados do metadado — é o que
 * permite decidir cache hit sem baixar o arquivo. Sem duração conhecida não há
 * como prever a grade, e aí o cache é conferido depois da amostragem.
 */
export function expectedAnalysisTimestamps(asset: {
  kind: 'image' | 'video';
  durationMs?: number | null;
}): number[] | null {
  if (asset.kind !== 'video') return [0];
  return asset.durationMs && asset.durationMs > 0 ? sampleTimestamps(asset.durationMs) : null;
}

export async function analyzeAsset(
  deps: ApiDeps,
  actor: { id?: string | null; email?: string | null },
  assetId: string,
  input: AnalysisInput = {},
): Promise<{ analysis: ContentAnalysisRow; cached: boolean }> {
  if (!deps.ai) throw unprocessable('IA indisponível no ambiente.');
  const [asset] = await getAssetsByIds(deps.db, [assetId]);
  if (!asset) throw notFound(`Criativo ${assetId} não encontrado.`);

  assertAnalysisEligible(asset);
  // A transcrição não olha a mídia (não há provedor aprovado): dá para saber
  // a identidade antes de baixar.
  const transcript = await unavailableTranscriber('sem provedor de transcrição aprovado').transcribe(
    new Uint8Array(),
    'pt-BR',
  );
  const { invoke, model } = deps.ai.contentBackend();
  const brandContext = input.brandContext ?? '';
  const timestamps = expectedAnalysisTimestamps(asset);
  const preComputedHash = timestamps
    ? contentInputHash({
        assetSha256: asset.sha256,
        model,
        promptVersion: CONTENT_PROMPT_VERSION,
        brandContext,
        timestamps,
        transcriptStatus: transcript.status,
      })
    : null;

  if (!input.force && preComputedHash) {
    const cached = await findAnalysisByInput(deps.db, asset.id, preComputedHash);
    if (cached) return { analysis: cached, cached: true };
  }

  const bytes = await deps.storage.get(asset.storageKey);
  const frames =
    asset.kind === 'video'
      ? (await sampleVideo(bytes, asset.filename)).frames
      // PNG/WebP chegavam ao provedor declarados como JPEG; o frame agora é
      // sempre JPEG e com o maior lado limitado (custo por pixel).
      : [{ t: 0, jpeg: await makeVisionFrame(bytes) }];

  if (!input.force && !preComputedHash) {
    // Sem grade previsível, a checagem de cache acontece aqui — depois do
    // trabalho caro, mas ainda antes de pagar o provedor.
    const cached = await findAnalysisByInput(
      deps.db,
      asset.id,
      contentInputHash({
        assetSha256: asset.sha256,
        model,
        promptVersion: CONTENT_PROMPT_VERSION,
        brandContext,
        timestamps: frames.map((frame) => frame.t),
        transcriptStatus: transcript.status,
      }),
    );
    if (cached) return { analysis: cached, cached: true };
  }

  const { analysis, meta } = await analyzeContent(invoke, model, {
    assetSha256: asset.sha256,
    frames,
    transcript,
    brandContext,
    filename: asset.filename,
    attribution: { clientId: asset.clientId, assetId: asset.id },
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
