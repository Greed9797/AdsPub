import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../plugins/auth.js';
import { assertAccountAccess } from '../lib/scope.js';
import type { ApiDeps } from '../lib/deps.js';
import { getPerformance } from '../services/performance.js';

/** T-005-3: motor determinístico antes de qualquer IA. */
export function performanceRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/performance', async (request) => {
    const user = currentUser(request);
    const query = z
      .object({
        ad_account_id: z.string().min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        source: z.enum(['file', 'api']).optional(),
        level: z.string().min(1).optional(),
      })
      .parse(request.query);
    await assertAccountAccess(deps, user, query.ad_account_id);
    return getPerformance(deps, {
      adAccountId: query.ad_account_id,
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.level ? { level: query.level } : {}),
    });
  });
}
