import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAccountsOfConnection } from '@adpub/db';
import { requireRole } from '../plugins/auth.js';
import { connectionDto, accountDto } from '../lib/dto.js';
import type { ApiDeps } from '../lib/deps.js';
import {
  createAndTestConnection,
  listAllConnections,
  retestConnection,
  rotateAndTestConnection,
} from '../services/connections.js';

const createBody = z.object({
  business_id: z.string().min(1),
  label: z.string().min(1),
  token: z.string().min(20),
});

export function connectionRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/connections', async (request) => {
    requireRole(request, ['admin']);
    const rows = await listAllConnections(deps);
    return rows.map(connectionDto);
  });

  app.post('/connections', async (request, reply) => {
    const user = requireRole(request, ['admin']);
    const body = createBody.parse(request.body);
    const connection = await createAndTestConnection(deps, user, {
      businessId: body.business_id,
      label: body.label,
      token: body.token,
    });
    return reply.status(201).send(connectionDto(connection));
  });

  app.post('/connections/:id/test', async (request) => {
    const user = requireRole(request, ['admin']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const connection = await retestConnection(deps, user, id);
    return connectionDto(connection);
  });

  /** T-001-3: troca o token (testado antes) e reativa a conexão. */
  app.post('/connections/:id/rotate', async (request) => {
    const user = requireRole(request, ['admin']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ token: z.string().min(20) }).strict().parse(request.body);
    const connection = await rotateAndTestConnection(deps, user, id, body.token);
    return connectionDto(connection);
  });

  app.post('/connections/:id/sync', async (request, reply) => {
    requireRole(request, ['admin']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await deps.queues.enqueueSync(id);
    return reply.status(202).send(job);
  });

  app.get('/connections/:id/ad-accounts', async (request) => {
    requireRole(request, ['admin']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const rows = await listAccountsOfConnection(deps.db, id);
    return rows.map(accountDto);
  });
}
