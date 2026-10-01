import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SESSION_COOKIE, verifySessionToken } from '@adpub/auth';
import { findUserById, type Database } from '@adpub/db';
import type { SessionUser } from '@adpub/shared';
import type { McpConfig } from '../config.js';
import { newSecret } from './hash.js';
import { clientNameFromRedirects, isValidRedirectUri } from './redirect.js';
import { renderConsent, renderConsentError } from './consent.js';
import { authorizationServerMetadata, protectedResourceMetadata } from './metadata.js';
import { ALL_SCOPES, SCOPE_READ, SCOPE_WRITE } from './scopes.js';
import {
  GrantError,
  createOAuthClientRecord,
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  loadOAuthClient,
  refreshGrant,
  revokeToken,
} from './store.js';

export interface OAuthRoutesOptions {
  db: Database;
  config: McpConfig;
}

const registerBody = z.object({
  client_name: z.string().max(120).optional(),
  redirect_uris: z.array(z.string().min(1)).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  scope: z.string().optional(),
});

const authorizeQuery = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  response_type: z.string().optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  resource: z.string().optional(),
});

function sessionFrom(request: FastifyRequest, secret: string): Promise<SessionUser | undefined> {
  const cookie = request.headers.cookie;
  if (!cookie) return Promise.resolve(undefined);
  const raw = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) return Promise.resolve(undefined);
  const token = decodeURIComponent(raw.slice(SESSION_COOKIE.length + 1));
  return verifySessionToken(token, secret).catch(() => undefined);
}

function redirectWith(
  reply: FastifyReply,
  redirectUri: string,
  params: Record<string, string | undefined>,
): FastifyReply {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return reply.redirect(url.href, 303);
}

export function registerOAuthRoutes(app: FastifyInstance, options: OAuthRoutesOptions): void {
  const { db, config } = options;

  // O OAuth manda formulário; o app inteiro é JSON, então o parser entra aqui.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    },
  );

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (path.startsWith('/mcp') || path === '/health') return;
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-headers', 'content-type, authorization');
    reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') return reply.status(204).send();
    return undefined;
  });

  app.get('/health', async () => ({ status: 'ok' }));

  const resource = protectedResourceMetadata(config);
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    app.get(path, async (_request, reply) =>
      reply.header('cache-control', 'no-store').send(resource),
    );
  }
  app.get('/.well-known/oauth-authorization-server', async (_request, reply) =>
    reply.header('cache-control', 'no-store').send(authorizationServerMetadata(config)),
  );

  /** Registro dinâmico (RFC 7591): é assim que o ChatGPT se cadastra sozinho. */
  app.post('/register', async (request, reply) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_client_metadata',
        error_description: parsed.error.issues.map((issue) => issue.message).join('; '),
      });
    }
    const invalid = parsed.data.redirect_uris.filter((uri) => !isValidRedirectUri(uri));
    if (invalid.length > 0) {
      return reply.status(400).send({
        error: 'invalid_redirect_uri',
        error_description: `redirect_uris precisa ser https de Grok, ChatGPT, Claude ou Cursor (ou http em localhost): ${invalid.join(', ')}`,
      });
    }

    const clientId = newSecret('client');
    const client = await createOAuthClientRecord(db, {
      clientId,
      clientName: parsed.data.client_name?.trim() || clientNameFromRedirects(parsed.data.redirect_uris),
      redirectUris: parsed.data.redirect_uris,
      scopes: parsed.data.scope
        ? ALL_SCOPES.filter((scope) => parsed.data.scope?.split(/\s+/).includes(scope))
        : [...ALL_SCOPES],
    });

    return reply.status(201).send({
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      scope: client.scopes.join(' '),
    });
  });

  /** Tela de consentimento: exige a sessão do AdPub no navegador. */
  app.get('/authorize', async (request, reply) => {
    const parsed = authorizeQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).type('text/html').send(renderConsentError('Pedido de autorização inválido.'));
    }
    const params = parsed.data;
    const client = await loadOAuthClient(db, params.client_id);
    if (!client || !client.redirectUris.includes(params.redirect_uri)) {
      return reply
        .status(400)
        .type('text/html')
        .send(renderConsentError('Cliente desconhecido ou redirect_uri não registrada.'));
    }

    const state = params.state ?? '';
    const fail = (error: string, description: string) =>
      redirectWith(reply, params.redirect_uri, {
        error,
        error_description: description,
        state,
        iss: config.issuer,
      });

    if ((params.response_type ?? 'code') !== 'code') {
      return fail('unsupported_response_type', 'só o fluxo authorization_code é suportado');
    }
    if (!params.code_challenge || params.code_challenge_method !== 'S256') {
      return fail('invalid_request', 'PKCE S256 é obrigatório');
    }
    if (params.resource && params.resource !== config.publicUrl.href) {
      return fail('invalid_target', 'resource desconhecido');
    }

    const session = await sessionFrom(request, config.authSecret);
    if (!session) {
      const next = encodeURIComponent(request.url);
      return reply.redirect(`${config.issuer}/login?next=${next}`, 302);
    }
    const user = await findUserById(db, session.id);
    if (!user || !user.active) {
      return reply
        .status(403)
        .type('text/html')
        .send(renderConsentError('Usuário inativo ou desconhecido. Fale com um admin do AdPub.'));
    }

    const csrf = createHmac('sha256', config.authSecret)
      .update([params.client_id, params.redirect_uri, state, params.code_challenge].join('\n'))
      .digest('base64url');

    return reply.type('text/html').send(
      renderConsent({
        clientName: client.clientName,
        clientId: params.client_id,
        redirectUri: params.redirect_uri,
        state,
        codeChallenge: params.code_challenge,
        resource: params.resource ?? null,
        csrf,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        // Consentimento começa sem escopo write e não oferece write a viewer:
        // viewer nunca recebe checkbox de alteração.
        writeAllowed: user.role !== 'viewer',
      }),
    );
  });

  app.post('/authorize', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string | undefined>;
    const clientId = body.client_id ?? '';
    const redirectUri = body.redirect_uri ?? '';
    const state = body.state ?? '';
    const codeChallenge = body.code_challenge ?? '';
    const resource = body.resource ? body.resource : null;

    const client = await loadOAuthClient(db, clientId);
    if (!client || !client.redirectUris.includes(redirectUri)) {
      return reply
        .status(400)
        .type('text/html')
        .send(renderConsentError('Cliente desconhecido ou redirect_uri não registrada.'));
    }

    const expected = createHmac('sha256', config.authSecret)
      .update([clientId, redirectUri, state, codeChallenge].join('\n'))
      .digest('base64url');
    const given = body.csrf ?? '';
    const csrfOk =
      expected.length === given.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(given));
    if (!csrfOk) {
      return reply
        .status(400)
        .type('text/html')
        .send(renderConsentError('Formulário expirado. Recomece pelo aplicativo.'));
    }

    if (body.decision !== 'approve') {
      return redirectWith(reply, redirectUri, {
        error: 'access_denied',
        error_description: 'o usuário recusou o acesso',
        state,
        iss: config.issuer,
      });
    }

    const session = await sessionFrom(request, config.authSecret);
    const user = session ? await findUserById(db, session.id) : undefined;
    if (!user || !user.active) {
      return reply
        .status(403)
        .type('text/html')
        .send(renderConsentError('Sessão expirada. Entre de novo no AdPub e repita o pedido.'));
    }

    // Viewer não recebe write mesmo marcando campo manualmente.
    const scopes = body.scope_write === '1' && user.role !== 'viewer' ? [SCOPE_READ, SCOPE_WRITE] : [SCOPE_READ];
    const code = await issueAuthorizationCode(db, {
      clientId,
      userId: user.id,
      redirectUri,
      codeChallenge,
      scopes,
      resource,
    });

    return redirectWith(reply, redirectUri, {
      code,
      state,
      iss: config.issuer,
    });
  });

  app.post('/token', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string | undefined>;
    const clientId = body.client_id ?? '';
    const client = await loadOAuthClient(db, clientId);
    reply.header('cache-control', 'no-store');

    if (!client) {
      return reply.status(401).send({
        error: 'invalid_client',
        error_description: 'client_id desconhecido',
      });
    }

    const resource = body.resource ? body.resource : null;
    try {
      if (body.grant_type === 'authorization_code') {
        const tokens = await exchangeAuthorizationCode(db, {
          clientId,
          code: body.code ?? '',
          redirectUri: body.redirect_uri ?? '',
          codeVerifier: body.code_verifier ?? '',
          resource,
        });
        return reply.send(tokens);
      }
      if (body.grant_type === 'refresh_token') {
        const tokens = await refreshGrant(db, {
          clientId,
          refreshToken: body.refresh_token ?? '',
          ...(body.scope ? { scope: body.scope } : {}),
          resource,
        });
        return reply.send(tokens);
      }
      throw new GrantError('unsupported_grant_type', `grant_type não suportado: ${body.grant_type ?? '(vazio)'}`);
    } catch (error) {
      if (error instanceof GrantError) {
        return reply
          .status(error.status)
          .send({ error: error.code, error_description: error.message });
      }
      throw error;
    }
  });

  app.post('/revoke', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string | undefined>;
    if (body.token) await revokeToken(db, body.token);
    // RFC 7009: revogação é idempotente e não revela se o token existia.
    return reply.status(200).send();
  });
}
