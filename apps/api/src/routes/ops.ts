import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ackAlert, aiCostTotal, itemsByStatusGlobal, resolveAlert } from '@adpub/db';
import { requireRole } from '../plugins/auth.js';
import type { ApiDeps } from '../lib/deps.js';

/**
 * T-009-3: painel operacional. Falha terminal <2% sobre itens tentados;
 * zero tolerância p/ ativação indevida, vazamento e duplicação (incidentes
 * contam à parte, nunca diluídos na média).
 */
export function opsRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/ops/metrics', async (request) => {
    requireRole(request, ['admin']);
    const [queues, aiCost, items] = await Promise.all([
      deps.queues.queueCounts(),
      aiCostTotal(deps.db),
      itemsByStatusGlobal(deps.db),
    ]);
    const failed = items.failed ?? 0;
    const published =
      (items.published ?? 0) + (items.in_review ?? 0) + (items.approved ?? 0) + (items.disapproved ?? 0);
    const attempted = failed + published;
    return {
      queues,
      ai_cost_usd: aiCost,
      items_by_status: items,
      terminal_failure_rate: attempted === 0 ? null : failed / attempted,
      terminal_failure_target: 0.02,
    };
  });

  app.patch('/ops/alerts/:id/ack', async (request) => {
    requireRole(request, ['admin', 'coordinator']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ackAlert(deps.db, id);
    return { ok: true };
  });

  app.patch('/ops/alerts/:id/resolve', async (request) => {
    requireRole(request, ['admin', 'coordinator']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await resolveAlert(deps.db, id);
    return { ok: true };
  });
}
