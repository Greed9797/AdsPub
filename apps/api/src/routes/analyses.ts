import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAnalyses } from '@adpub/db';
import type { ContentAnalysis } from '@adpub/creative-intel';
import { currentUser, requireRole } from '../plugins/auth.js';
import { requireFeature } from '../lib/features.js';
import { notFound } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { analyzeAsset, correctAnalysis } from '../services/analyses.js';

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
  app.post('/assets/:id/analyses', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    requireFeature(deps, 'featureAiAnalysis');
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ brand_context: z.string().max(2000).optional(), force: z.boolean().default(false) })
      .default({ force: false })
      .parse(request.body ?? {});
    const { analysis, cached } = await analyzeAsset(
      deps,
      { id: user.id, email: user.email },
      id,
      {
        // O corpo HTTP fala snake_case; o serviço fala camelCase. Sem este
        // mapeamento o contexto de marca era aceito e descartado em silêncio.
        ...(body.brand_context ? { brandContext: body.brand_context } : {}),
        force: body.force,
      },
    );
    return reply.status(cached ? 200 : 201).send(analysisDto(analysis));
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
