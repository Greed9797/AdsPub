import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  analysisJobTimings,
  createAnalysisJob,
  findActiveAnalysisJob,
  getAnalysisById,
  getAnalysisJob,
  getAssetsByIds,
  listAnalyses,
} from '@adpub/db';
import { assertMediaWithinLimits, type ContentAnalysis } from '@adpub/creative-intel';
import { currentUser, requireRole } from '../plugins/auth.js';
import { requireFeature } from '../lib/features.js';
import { notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { correctAnalysis } from '../services/analyses.js';

const observationSchema = z.object({
  tipo: z.string().min(1),
  texto: z.string().min(1),
  evidence_refs: z
    .array(
      z.object({
        kind: z.enum(['frame', 'transcript']),
        t: z.number().optional(),
        detail: z.string().min(1),
      }),
    )
    .min(1),
});

const findingsSchema = z.object({
  observations: z.array(observationSchema).default([]),
  limitations: z.array(z.string()).default([]),
});

/** T-006-2: análise de conteúdo versionada, sem performance junto. */
export function analysisRoutes(app: FastifyInstance, deps: ApiDeps): void {
  /**
   * A9: a rota confirma o recebimento e devolve o job. ffmpeg e IA rodam no
   * worker; o cliente acompanha em `/analysis-jobs/:id`.
   */
  app.post('/assets/:id/analyses', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    requireFeature(deps, 'featureAiAnalysis');
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ brand_context: z.string().max(2000).optional(), force: z.boolean().default(false) })
      .default({ force: false })
      .parse(request.body ?? {});

    const [asset] = await getAssetsByIds(deps.db, [id]);
    if (!asset) throw notFound(`Criativo ${id} não encontrado.`);
    // Teto conferido por metadado, antes de enfileirar: arquivo sabidamente
    // grande falha aqui, não depois de ocupar a fila.
    try {
      assertMediaWithinLimits(asset);
    } catch (error) {
      throw unprocessable(error instanceof Error ? error.message : String(error));
    }

    // Pedir de novo enquanto roda não duplica trabalho nem cobrança.
    const active = await findActiveAnalysisJob(deps.db, asset.id);
    if (active) return reply.status(202).send(jobDto(active));

    const job = await createAnalysisJob(deps.db, {
      assetId: asset.id,
      brandContext: body.brand_context ?? '',
      force: body.force,
      requestedBy: user.id,
    });
    const queued = await deps.queues.enqueueAnalysis(job.id);
    return reply.status(202).send({ ...jobDto(job), queue: queued.queue, queue_job_id: queued.job_id });
  });

  app.get('/analysis-jobs/:id', async (request) => {
    currentUser(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await getAnalysisJob(deps.db, id);
    if (!job) throw notFound(`Job ${id} não encontrado.`);
    const analysis = job.analysisId ? await getAnalysisById(deps.db, job.analysisId) : undefined;
    return {
      ...jobDto(job),
      // Fila e execução medidos separadamente: é o número que diz se o
      // gargalo é espera ou processamento.
      ...analysisJobTimings(job),
      analysis: analysis ? analysisDto(analysis) : null,
    };
  });

  app.get('/assets/:id/analyses', async (request) => {
    currentUser(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const rows = await listAnalyses(deps.db, id);
    if (rows.length === 0) throw notFound(`Sem análises para ${id}.`);
    return rows.map(analysisDto);
  });

  app.patch('/analyses/:id', async (request) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ findings: findingsSchema }).strict().parse(request.body);
    const revision = await correctAnalysis(
      deps,
      { id: user.id, email: user.email },
      id,
      body.findings as ContentAnalysis,
    );
    return analysisDto(revision);
  });
}

function jobDto(row: {
  id: string;
  assetId: string;
  status: string;
  error: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}) {
  return {
    job_id: row.id,
    asset_id: row.assetId,
    status: row.status,
    error: row.error,
    queued_at: row.queuedAt,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
  };
}

function analysisDto(row: {
  id: string;
  assetId: string;
  promptVersion: string;
  modelId: string;
  schemaVersion: string;
  findings: unknown;
  coverage: unknown;
  costUsd: string;
  latencyMs: number;
  revision: number;
  supersededBy: string | null;
}) {
  return {
    id: row.id,
    asset_id: row.assetId,
    prompt_version: row.promptVersion,
    model_id: row.modelId,
    schema_version: row.schemaVersion,
    findings: row.findings,
    coverage: row.coverage,
    cost_usd: row.costUsd,
    latency_ms: row.latencyMs,
    revision: row.revision,
    superseded_by: row.supersededBy,
  };
}
