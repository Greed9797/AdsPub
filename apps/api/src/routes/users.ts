import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  audit,
  listUserAccounts,
  listUsers,
  setUserAccounts,
  setUserRole,
  upsertUserFromLogin,
} from '@adpub/db';
import { isAllowedDomain } from '@adpub/auth';
import { roleSchema } from '@adpub/shared';
import { currentUser, requireRole } from '../plugins/auth.js';
import { userDto } from '../lib/dto.js';
import { forbidden, notFound } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

const loginBody = z.object({
  email: z.string().email(),
  name: z.string().default(''),
  google_sub: z.string().min(1),
});

export function userRoutes(app: FastifyInstance, deps: ApiDeps): void {
  /**
   * Rota interna do BFF (Next.js): cria/atualiza o usuário depois do OAuth do
   * Google. Autenticada pelo segredo compartilhado, não pela sessão — é ela que
   * emite a primeira sessão. US6: fora do domínio ou inativo não entra.
   */
  app.post('/auth/login', async (request) => {
    const secret = request.headers['x-adpub-login-secret'];
    if (secret !== deps.env.authSecret) throw forbidden('Segredo de login inválido.');

    const body = loginBody.parse(request.body);
    if (!isAllowedDomain(body.email, deps.env.allowedDomain)) {
      throw forbidden(`E-mail ${body.email} fora do domínio corporativo.`);
    }

    const user = await upsertUserFromLogin(deps.db, {
      email: body.email.toLowerCase(),
      name: body.name,
      googleSub: body.google_sub,
    });
    if (!user.active) throw forbidden('Usuário inativo.');

    await audit(deps.db, {
      actor: { id: user.id, email: user.email },
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
    });

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });

  app.get('/me', async (request) => {
    const user = currentUser(request);
    const accounts = await listUserAccounts(deps.db, user.id);
    return { ...user, ad_account_ids: accounts };
  });

  app.get('/users', async (request) => {
    requireRole(request, ['admin']);
    const rows = await listUsers(deps.db);
    return Promise.all(
      rows.map(async (row) => userDto(row, await listUserAccounts(deps.db, row.id))),
    );
  });

  app.patch('/users/:id', async (request) => {
    const actor = requireRole(request, ['admin']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        role: roleSchema.optional(),
        ad_account_ids: z.array(z.string().min(1)).optional(),
      })
      .parse(request.body);

    let updated = (await listUsers(deps.db)).find((row) => row.id === id);
    if (!updated) throw notFound(`Usuário ${id} não encontrado.`);
    if (body.role) {
      updated = (await setUserRole(deps.db, id, body.role)) ?? updated;
    }
    if (body.ad_account_ids) {
      await setUserAccounts(deps.db, id, body.ad_account_ids);
    }
    await audit(deps.db, {
      actor: { id: actor.id, email: actor.email },
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      after: body,
    });
    return userDto(updated, await listUserAccounts(deps.db, id));
  });
}
