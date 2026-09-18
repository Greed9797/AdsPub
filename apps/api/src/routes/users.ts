import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  LOGIN_FAILED_MESSAGE,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  isAllowedDomain,
  verifyPassword,
} from '@adpub/auth';
import {
  audit,
  createUser,
  findUserByEmail,
  hasAnyPassword,
  listUserAccounts,
  listUsers,
  setUserAccounts,
  setUserActive,
  setUserPassword,
  setUserRole,
  withBootstrapLock,
} from '@adpub/db';
import { roleSchema } from '@adpub/shared';
import { currentUser, requireRole } from '../plugins/auth.js';
import { userDto } from '../lib/dto.js';
import { conflict, forbidden, notFound, tooMany, unauthorized } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS, loginThrottleKey } from '../lib/login-throttle.js';

const passwordLoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const bootstrapBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).default(''),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

const createUserBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).default(''),
  role: roleSchema,
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

function loginSecretOk(request: { headers: Record<string, unknown> }, deps: ApiDeps): boolean {
  return request.headers['x-adpub-login-secret'] === deps.env.authSecret;
}

export function userRoutes(app: FastifyInstance, deps: ApiDeps): void {
  /**
   * Login nativo do BFF (Next.js): confere e-mail + senha. Autenticado pelo
   * segredo compartilhado, não pela sessão — é ele que emite a primeira
   * sessão. Falha genérica idêntica para desconhecido, inativo, fora do
   * domínio ou senha errada (sem enumeração); throttle por e-mail + IP.
   */
  app.post('/auth/password/login', async (request) => {
    if (!loginSecretOk(request, deps)) throw forbidden('Segredo de login inválido.');

    const body = passwordLoginBody.parse(request.body);
    const email = body.email.toLowerCase();
    const key = loginThrottleKey(email, request.ip);
    let blocked: boolean;
    try {
      blocked =
        !!deps.loginThrottle && (await deps.loginThrottle.failures(key)) >= LOGIN_MAX_FAILURES;
    } catch {
      blocked = true;
    }
    if (blocked) throw tooMany();

    const fail = async (): Promise<never> => {
      try {
        await deps.loginThrottle?.registerFailure(key, LOGIN_WINDOW_SECONDS);
      } catch {
        // Falha do throttle não muda a resposta: continua 401 genérico.
      }
      throw unauthorized(LOGIN_FAILED_MESSAGE);
    };

    if (!isAllowedDomain(email, deps.env.allowedDomain)) return fail();
    const user = await findUserByEmail(deps.db, email);
    if (!user || !user.active || !user.passwordHash) return fail();
    if (!verifyPassword(body.password, user.passwordHash)) return fail();

    try {
      await deps.loginThrottle?.clear(key);
    } catch {
      // Limpeza best-effort: o login já foi conferido.
    }
    await audit(deps.db, {
      actor: { id: user.id, email: user.email },
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
    });

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });

  /**
   * Bootstrap do primeiro admin: só existe enquanto nenhum usuário tem senha.
   * Depois do primeiro uso a rota responde 404 para sempre (auto-desligada).
   */
  app.get('/auth/password/bootstrap', async (request) => {
    if (!loginSecretOk(request, deps)) throw forbidden('Segredo de login inválido.');
    return { available: !(await hasAnyPassword(deps.db)) };
  });

  app.post('/auth/password/bootstrap', async (request) => {
    if (!loginSecretOk(request, deps)) throw forbidden('Segredo de login inválido.');
    return withBootstrapLock(deps.db, async (tx) => {
      if (await hasAnyPassword(tx)) throw notFound('Bootstrap indisponível.');

      const body = bootstrapBody.parse(request.body);
      const email = body.email.toLowerCase();
      if (!isAllowedDomain(email, deps.env.allowedDomain)) {
        throw forbidden(`E-mail ${body.email} fora do domínio corporativo.`);
      }
      if (await findUserByEmail(tx, email)) throw conflict(`Usuário ${email} já existe.`);

      const user = await createUser(tx, {
        email,
        name: body.name,
        role: 'admin',
        passwordHash: hashPassword(body.password),
      });
      await audit(tx, {
        actor: { id: user.id, email: user.email },
        action: 'user.create',
        entityType: 'user',
        entityId: user.id,
      });

      return { id: user.id, email: user.email, name: user.name, role: user.role };
    });
  });

  app.get('/me', async (request) => {
    const user = currentUser(request);
    const accounts = await listUserAccounts(deps.db, user.id);
    return { ...user, ad_account_ids: accounts };
  });

  // Sessão vigente do banco (etapa 1): o BFF valida o cookie aqui em vez de
  // confiar no JWT local. 401 = sem sessão; API fora = erro recuperável no BFF.
  app.get('/auth/me', async (request) => {
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

  app.post('/users', async (request) => {
    const actor = requireRole(request, ['admin']);
    const body = createUserBody.parse(request.body);
    const email = body.email.toLowerCase();
    if (!isAllowedDomain(email, deps.env.allowedDomain)) {
      throw forbidden(`E-mail ${body.email} fora do domínio corporativo.`);
    }
    if (await findUserByEmail(deps.db, email)) throw conflict(`Usuário ${email} já existe.`);

    const user = await createUser(deps.db, {
      email,
      name: body.name,
      role: body.role,
      passwordHash: hashPassword(body.password),
    });
    await audit(deps.db, {
      actor: { id: actor.id, email: actor.email },
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
    });
    return userDto(user, []);
  });

  app.patch('/users/:id', async (request) => {
    const actor = requireRole(request, ['admin']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        role: roleSchema.optional(),
        active: z.boolean().optional(),
        password: z.string().min(PASSWORD_MIN_LENGTH).optional(),
        ad_account_ids: z.array(z.string().min(1)).optional(),
      })
      .parse(request.body);

    let updated = (await listUsers(deps.db)).find((row) => row.id === id);
    if (!updated) throw notFound(`Usuário ${id} não encontrado.`);
    if (body.role) {
      updated = (await setUserRole(deps.db, id, body.role)) ?? updated;
    }
    if (body.active !== undefined) {
      updated = (await setUserActive(deps.db, id, body.active)) ?? updated;
    }
    if (body.password) {
      updated = (await setUserPassword(deps.db, id, hashPassword(body.password))) ?? updated;
    }
    if (body.ad_account_ids) {
      await setUserAccounts(deps.db, id, body.ad_account_ids);
    }
    await audit(deps.db, {
      actor: { id: actor.id, email: actor.email },
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      after: { ...body, ...(body.password ? { password: '[redacted]' } : {}) },
    });
    return userDto(updated, await listUserAccounts(deps.db, id));
  });
}
