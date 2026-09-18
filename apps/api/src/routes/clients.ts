import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, createClient, getClient, listClients, listVisibleAccounts, updateClient } from '@adpub/db';
import { clientInputSchema } from '@adpub/shared';
import { currentUser, requireRole } from '../plugins/auth.js';
import { clientDto } from '../lib/dto.js';
import { notFound } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

export function clientRoutes(app: FastifyInstance, deps: ApiDeps): void {
  /**
   * Etapa 2: a lista é o universo do usuário. admin/coordinator veem todos;
   * manager/viewer só clientes com ao menos uma conta visível — é o mesmo
   * escopo que o resto da API cobra (FR-021), não uma ACL nova.
   */
  app.get('/clients', async (request) => {
    const user = currentUser(request);
    const rows = await listClients(deps.db);
    if (user.role === 'admin' || user.role === 'coordinator') return rows.map(clientDto);

    const visible = await listVisibleAccounts(deps.db, { userId: user.id, role: user.role });
    const mine = new Set(visible.map((account) => account.clientId).filter(Boolean));
    return rows.filter((row) => mine.has(row.id)).map(clientDto);
  });

  app.post('/clients', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    const input = clientInputSchema.parse(request.body);
    const row = await createClient(deps.db, input);
    await audit(deps.db, {
      actor: { id: user.id, email: user.email },
      action: 'client.create',
      entityType: 'client',
      entityId: row.id,
      after: { name: row.name },
    });
    return reply.status(201).send(clientDto(row));
  });

  app.patch('/clients/:id', async (request) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsed = clientInputSchema.partial().parse(request.body);
    const before = await getClient(deps.db, id);
    if (!before) throw notFound(`Cliente ${id} não encontrado.`);

    // `partial()` reaplica os `.default()` do schema: sem este filtro um PATCH
    // de um campo zeraria voice_profile/UTMs/domínios do cliente.
    const sent = new Set(Object.keys((request.body ?? {}) as Record<string, unknown>));
    const patch = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => sent.has(key)),
    ) as typeof parsed;

    const updated = await updateClient(deps.db, id, {
      ...patch,
      ...(patch.voice_profile
        ? { voice_profile: { ...before.voiceProfile, ...patch.voice_profile } }
        : {}),
    });
    if (!updated) throw notFound(`Cliente ${id} não encontrado.`);
    await audit(deps.db, {
      actor: { id: user.id, email: user.email },
      action: 'client.update',
      entityType: 'client',
      entityId: id,
      before: clientDto(before),
      after: clientDto(updated),
    });
    return clientDto(updated);
  });
}
