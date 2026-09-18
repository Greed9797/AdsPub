import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, verifySessionToken } from '@adpub/auth';
import { findUserById } from '@adpub/db';
import type { Role, SessionUser } from '@adpub/shared';
import { forbidden, unauthorized } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

const PUBLIC_PATHS = new Set([
  '/health',
  '/api/v1/health',
  '/api/v1/auth/password/login',
  '/api/v1/auth/password/bootstrap',
  '/docs',
  '/docs/json',
  '/openapi.json',
]);

function bearerFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function registerAuth(app: FastifyInstance, deps: ApiDeps): void {
  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?')[0] ?? '';
    if (PUBLIC_PATHS.has(path) || path.startsWith('/docs')) return;

    const token = bearerFrom(request);
    if (!token) throw unauthorized();
    let claimed: SessionUser;
    try {
      claimed = deps.verifySession
        ? await deps.verifySession(token)
        : await verifySessionToken(token, deps.env.authSecret);
    } catch {
      throw unauthorized('Sessão expirada ou assinatura inválida.');
    }
    // Sessão válida usa id/email/name/role vigentes do banco. Sem cache que
    // prolongue revogação: desativado/inexistente → 401, rebaixado vale na hora.
    const row = await findUserById(deps.db, claimed.id);
    if (!row || !row.active) throw unauthorized('Usuário desativado ou inexistente.');
    request.user = { id: row.id, email: row.email, name: row.name, role: row.role };
  });
}

export function currentUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw unauthorized();
  return request.user;
}

export function requireRole(request: FastifyRequest, roles: readonly Role[]): SessionUser {
  const user = currentUser(request);
  if (!roles.includes(user.role)) {
    throw forbidden(`Ação restrita a: ${roles.join(', ')}.`);
  }
  return user;
}
