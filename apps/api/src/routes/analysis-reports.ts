import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser, requireRole } from '../plugins/auth.js';
import type { ApiDeps } from '../lib/deps.js';
import { requireFeature } from '../lib/features.js';
import {
  addReportFeedback,
  createTestDraft,
  generateReport,
  reportDetails,
  reportDto,
} from '../services/reports.js';
import { getReport } from '@adpub/db';

/** T-007-2: gerar, ver, corrigir, exportar e transformar em rascunho. */
export function analysisReportRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.post('/analysis-reports', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    requireFeature(deps, 'featureAiAnalysis');
    const body = z
      .object({
        ad_account_id: z.string().min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        source: z.enum(['file', 'api']).optional(),
      })
      .strict()
      .parse(request.body);
    const { assertAccountAccess } = await import('../lib/scope.js');
    await assertAccountAccess(deps, user, body.ad_account_id);
    const row = await generateReport(deps, { id: user.id, email: user.email }, {
      adAccountId: body.ad_account_id,
      from: body.from,
      to: body.to,
      ...(body.source ? { source: body.source } : {}),
    });
    return reply.status(201).send(reportDto(row));
  });

  app.get('/analysis-reports/:id', async (request) => {
    currentUser(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return reportDetails(deps, id);
  });

  app.post('/analysis-reports/:id/feedback', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ text: z.string().min(1).max(5000) }).strict().parse(request.body);
    await addReportFeedback(deps, { id: user.id, email: user.email }, id, body.text);
    return reply.status(201).send({ ok: true });
  });

  app.get('/analysis-reports/:id/export', async (request, reply) => {
    currentUser(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z.object({ format: z.enum(['html', 'csv']).default('html') }).parse(request.query);
    const row = await getReport(deps.db, id);
    if (!row) {
      const { notFound } = await import('../lib/problem.js');
      throw notFound(`Relatório ${id} não encontrado.`);
    }
    const output = row.output as {
      performance_findings: Array<{ text: string }>;
      hypotheses: Array<{ text: string }>;
      recommended_tests: Array<{ variable: string; goal: string }>;
      limitations: string[];
    };
    if (query.format === 'csv') {
      const lines = [
        'secao;texto',
        ...output.performance_findings.map((f) => `fato;${csvCell(f.text)}`),
        ...output.hypotheses.map((h) => `hipotese;${csvCell(h.text)}`),
        ...output.recommended_tests.map((t) => `teste;${csvCell(`${t.variable} → ${t.goal}`)}`),
        ...output.limitations.map((l) => `limite;${csvCell(l)}`),
      ];
      return reply.type('text/csv').send(lines.join('\n'));
    }
    const esc = (text: string) =>
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const items = (list: string[]) => list.map((t) => `<li>${esc(t)}</li>`).join('');
    return reply.type('text/html').send(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${esc(row.id)}</title></head><body>` +
        `<h1>Relatório de criativos</h1>` +
        `<h2>Fatos</h2><ul>${items(output.performance_findings.map((f) => f.text))}</ul>` +
        `<h2>Hipóteses</h2><ul>${items(output.hypotheses.map((h) => h.text))}</ul>` +
        `<h2>Testes</h2><ul>${items(output.recommended_tests.map((t) => `${t.variable} → ${t.goal}`))}</ul>` +
        `<h2>Limitações</h2><ul>${items(output.limitations)}</ul>` +
        `</body></html>`,
    );
  });

  app.post('/analysis-reports/:id/test-drafts', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ briefing: z.string().min(1).max(8000) }).strict().parse(request.body);
    const result = await createTestDraft(deps, { id: user.id, email: user.email }, id, body.briefing);
    return reply.status(201).send(result);
  });
}

function csvCell(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}
