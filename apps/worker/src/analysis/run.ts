import {
  CONTENT_PROMPT_VERSION,
  analyzeContent,
  assertMediaWithinLimits,
  contentInputHash,
  sampleTimestamps,
  sampleVideo,
  unavailableTranscriber,
  type ContentAnalysis,
  type Frame,
} from '@adpub/creative-intel';
import { makeVisionFrame } from '@adpub/media';
import {
  audit,
  failAnalysisJob,
  findAnalysisByInput,
  finishAnalysisJob,
  getAnalysisJob,
  getAssetsByIds,
  insertAnalysis,
  markAnalysisJobStarted,
  type AnalysisJobRow,
  type ContentAnalysisRow,
} from '@adpub/db';
import type { AiClient } from '@adpub/ai';
import type { WorkerContext } from '../context.js';

/**
 * A9: análise de mídia roda no worker, não na requisição. ffmpeg satura CPU e
 * memória; a API só cria a linha do job e enfileira.
 */

export interface AnalysisRunResult {
  analysis: ContentAnalysisRow;
  cached: boolean;
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

/** Análise em si: mesma ordem de antes (cache antes do download) sem HTTP. */
export async function analyzeAsset(
  ctx: WorkerContext,
  ai: AiClient,
  assetId: string,
  input: { brandContext?: string; force?: boolean } = {},
): Promise<AnalysisRunResult> {
  const [asset] = await getAssetsByIds(ctx.db, [assetId]);
  if (!asset) throw new Error(`Criativo ${assetId} não encontrado.`);

  assertMediaWithinLimits(asset);
  // A transcrição não olha a mídia (não há provedor aprovado): dá para saber
  // a identidade antes de baixar.
  const transcript = await unavailableTranscriber('sem provedor de transcrição aprovado').transcribe(
    new Uint8Array(),
    'pt-BR',
  );
  const { invoke, model } = ai.contentBackend();
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
    const cached = await findAnalysisByInput(ctx.db, asset.id, preComputedHash);
    if (cached) return { analysis: cached, cached: true };
  }

  const bytes = await ctx.storage.get(asset.storageKey);
  const frames =
    asset.kind === 'video'
      ? (await sampleVideo(bytes, asset.filename)).frames
      // PNG/WebP chegavam ao provedor declarados como JPEG; o frame agora é
      // sempre JPEG e com o maior lado limitado (custo por pixel).
      : ([{ t: 0, jpeg: await makeVisionFrame(bytes) }] satisfies Frame[]);

  if (!input.force && !preComputedHash) {
    // Sem grade previsível, a checagem de cache acontece aqui — depois do
    // trabalho caro, mas ainda antes de pagar o provedor.
    const cached = await findAnalysisByInput(
      ctx.db,
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
  const row = await insertAnalysis(ctx.db, {
    assetId: asset.id,
    assetSha: asset.sha256,
    promptVersion: meta.promptVersion,
    modelId: meta.model,
    schemaVersion: meta.schemaVersion,
    inputHash: meta.inputHash,
    findings: analysis satisfies ContentAnalysis,
    coverage: {
      observed: frames.map((f) => [f.t, f.t] as [number, number]),
      transcript: transcript.status,
    },
    costUsd: String(meta.costUsd),
    latencyMs: meta.latencyMs,
    revision: 1,
  });
  return { analysis: row, cached: false };
}

/**
 * Executa o job persistido. Reentrega não roda de novo: linha já concluída ou
 * em execução é ignorada, o que protege contra cobrança dupla de IA.
 */
export async function runAnalysis(
  ctx: WorkerContext,
  ai: AiClient | undefined,
  input: { jobId: string },
): Promise<void> {
  const job = await getAnalysisJob(ctx.db, input.jobId);
  if (!job) return;
  if (job.status === 'done' || job.status === 'running') return;
  if (!ai) throw new Error('ANTHROPIC_API_KEY ausente: análise de mídia indisponível.');

  await markAnalysisJobStarted(ctx.db, job.id);
  try {
    const { analysis, cached } = await analyzeAsset(ctx, ai, job.assetId, {
      brandContext: job.brandContext,
      force: job.force,
    });
    await finishAnalysisJob(ctx.db, job.id, analysis.id);
    await audit(ctx.db, {
      actor: { id: job.requestedBy, email: null },
      action: 'content.analyze',
      entityType: 'asset',
      entityId: job.assetId,
      after: { analysis_id: analysis.id, job_id: job.id, cached },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failAnalysisJob(ctx.db, job.id, message);
    throw error;
  }
}

export type { AnalysisJobRow };
