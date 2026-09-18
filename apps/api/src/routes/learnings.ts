import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser, requireRole } from '../plugins/auth.js';
import type { ApiDeps } from '../lib/deps.js';
import { requireFeature } from '../lib/features.js';
import { assertClientAccess } from '../lib/scope.js';
import {
  learningBriefing,
  learningTestDraft,
  listClientLearnings,
  recordOutcome,
  saveLearning,
} from '../services/learnings.js';

/** T-008-2: ciclo aprendizado → briefing → rascunho → ativação → resultado. */
export function learningRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.post('/learnings', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    requireFeature(deps, 'featureReports');
    const body = z
      .object({
        client_id: z.string().uuid(),
        ad_account_id: z.string().min(1).optional(),
        source_report_id: z.string().uuid(),
        hypothesis: z.string().min(1).max(5000),
        origin_variant_ids: z.array(z.string().uuid()).default([]),
        evidence: z.record(z.string(), z.unknown()).default({}),
        limitations: z.array(z.string()).default([]),
        control_variant_id: z.string().uuid().optional(),
        primary_metric: z.string().max(100).optional(),
        test_conditions: z.string().max(2000).optional(),
      })
      .strict()
      .parse(request.body);
    await assertClientAccess(deps, user, body.client_id);
    const row = await saveLearning(deps, { id: user.id, email: user.email }, {
      clientId: body.client_id,
      adAccountId: body.ad_account_id ?? null,
      sourceReportId: body.source_report_id,
      hypothesis: body.hypothesis,
      originVariantIds: body.origin_variant_ids,
      evidence: body.evidence as Record<string, unknown>,
      limitations: body.limitations,
      controlVariantId: body.control_variant_id ?? null,
      primaryMetric: body.primary_metric ?? null,
      testConditions: body.test_conditions ?? null,
    });
    return reply.status(201).send({ id: row.id, evidence_level: row.evidenceLevel });
  });

  app.get('/learnings', async (request) => {
    const user = currentUser(request);
    const query = z.object({ client_id: z.string().uuid() }).parse(request.query);
    await assertClientAccess(deps, user, query.client_id);
    const rows = await listClientLearnings(deps, query.client_id);
    return rows.map((r) => ({
      id: r.id,
      hypothesis: r.hypothesis,
      evidence_level: r.evidenceLevel,
      outcome: r.outcome,
      test_batch_id: r.testBatchId,
      result_summary: r.resultSummary,
    }));
  });

  app.post('/learnings/:id/test-briefing', async (request) => {
    requireRole(request, ['admin', 'coordinator', 'manager']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return learningBriefing(deps, id);
  });

  app.post('/learnings/:id/test-drafts', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ briefing: z.string().min(1).max(8000) }).strict().parse(request.body);
    const result = await learningTestDraft(deps, { id: user.id, email: user.email }, id, body.briefing);
    return reply.status(201).send(result);
  });

  app.patch('/learnings/:id/outcome', async (request) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        evidence_level: z.enum(['consistent_observation', 'controlled_test']).optional(),
        activated_at: z.string().nullable().optional(),
        test_design: z.string().nullable().optional(),
        result_summary: z.string().nullable().optional(),
        outcome: z.enum(['positive', 'negative', 'inconclusive']).nullable().optional(),
      })
      .strict()
      .parse(request.body);
    return recordOutcome(
      deps,
      { id: user.id, email: user.email },
      id,
      {
        ...(body.evidence_level ? { evidenceLevel: body.evidence_level } : {}),
        ...(body.activated_at !== undefined ? { activatedAt: body.activated_at } : {}),
        ...(body.test_design !== undefined ? { testDesign: body.test_design } : {}),
        ...(body.result_summary !== undefined ? { resultSummary: body.result_summary } : {}),
        ...(body.outcome !== undefined ? { outcome: body.outcome } : {}),
      },
    );
  });
}
