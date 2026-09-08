import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAudit } from '@adpub/db';
import { requireRole } from '../plugins/auth.js';
import type { ApiDeps } from '../lib/deps.js';

const query = z.object({
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  actor_id: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export function auditRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/audit', async (request) => {
    requireRole(request, ['admin', 'coordinator']);
    const q = query.parse(request.query);
    const rows = await listAudit(deps.db, {
      ...(q.entity_type ? { entityType: q.entity_type } : {}),
      ...(q.entity_id ? { entityId: q.entity_id } : {}),
      ...(q.actor_id ? { actorId: q.actor_id } : {}),
      ...(q.from ? { from: q.from } : {}),
      ...(q.to ? { to: q.to } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
    });
    return rows.map((row) => ({
      id: row.id,
      actor_id: row.actorId,
      actor_email: row.actorEmail,
      action: row.action,
      entity_type: row.entityType,
      entity_id: row.entityId,
      before: row.before,
      after: row.after,
      created_at: row.createdAt.toISOString(),
    }));
  });
}
