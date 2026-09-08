import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../lib/deps.js';

export function healthRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/health', async () => ({
    status: 'ok',
    meta_api_version: deps.env.metaApiVersion,
    meta_tier: deps.env.metaTier,
    uptime_s: Math.round(process.uptime()),
  }));
}
