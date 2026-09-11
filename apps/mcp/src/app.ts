import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/fastify';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  McpServer,
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  verifyBearerToken,
  type AuthInfo,
} from '@modelcontextprotocol/server';
import { findUserById, type Database } from '@adpub/db';
import { redactingLogger } from '@adpub/telemetry';
import { createApiClient, sessionUserOf } from './api.js';
import type { McpConfig } from './config.js';
import { registerOAuthRoutes } from './oauth/routes.js';
import { verifyAccessToken } from './oauth/store.js';
import { registerTools } from './tools.js';

export interface McpAppOptions {
  db: Database;
  config: McpConfig;
  fetchImpl?: typeof fetch;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const INSTRUCTIONS = [
  'O AdPub publica anúncios Meta em lote para agências.',
  'Comece por listar_clientes e listar_contas para descobrir os ids; use ver_lote para entender o que já existe.',
  'Diga os valores em reais e datas no formato brasileiro ao responder.',
  'Publicar gasta verba real: valide o lote e confirme a quantidade de itens com o usuário antes de chamar publicar_lote.',
].join('\n');

export async function buildMcpApp(options: McpAppOptions): Promise<FastifyInstance> {
  const { db, config } = options;
  const allowedHosts = [...new Set([...LOCAL_HOSTS, ...config.allowedHosts])];

  const loggerInstance: FastifyBaseLogger = redactingLogger(config.logLevel);
  const app = Fastify({
    loggerInstance,
    trustProxy: true,
    bodyLimit: 4 * 1024 * 1024,
  });

  app.addHook('onRequest', hostHeaderValidation(allowedHosts));
  app.addHook('onRequest', originValidation(allowedHosts));

  registerOAuthRoutes(app, { db, config });

  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(config.publicUrl);
  const api = createApiClient({
    apiUrl: config.apiUrl,
    authSecret: config.authSecret,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const handler = createMcpHandler(async ({ authInfo }) => {
    const server = new McpServer({ name: 'adpub', version: '0.1.0' }, { instructions: INSTRUCTIONS });
    const userId = authInfo?.extra?.['userId'];
    const row = typeof userId === 'string' ? await findUserById(db, userId) : undefined;
    if (!row || !row.active) throw new Error('Usuário do token não existe mais.');

    registerTools(server, {
      api,
      user: sessionUserOf(row),
      scopes: authInfo?.scopes ?? [],
    });
    return server;
  });
  const nodeHandler = toNodeHandler(handler);

  /** Porteiro do `/mcp`: sem token válido a resposta é o desafio do RFC 9728. */
  async function gate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthInfo | undefined> {
    try {
      return await verifyBearerToken(request.headers.authorization, {
        verifier: { verifyAccessToken: (token) => verifyAccessToken(db, config.publicUrl, token) },
        resourceMetadataUrl,
      });
    } catch (error) {
      const challenge = bearerAuthChallengeResponse(error, { resourceMetadataUrl });
      reply.status(challenge.status).headers(Object.fromEntries(challenge.headers.entries()));
      reply.send(await challenge.text());
      return undefined;
    }
  }

  app.all('/mcp', async (request, reply) => {
    const authInfo = await gate(request, reply);
    if (!authInfo) return reply;

    Object.assign(request.raw, { auth: authInfo });
    reply.hijack();
    await nodeHandler(request.raw, reply.raw, request.body);
    return reply;
  });

  return app;
}
