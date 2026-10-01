import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { MAX_UPLOAD_BYTES } from '@adpub/config';
import { redactingLogger } from '@adpub/telemetry';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/errors.js';
import { registerOpenApi } from './plugins/openapi.js';
import { accountRoutes } from './routes/accounts.js';
import { assetRoutes } from './routes/assets.js';
import { auditRoutes } from './routes/audit.js';
import { batchRoutes } from './routes/batches.js';
import { clientRoutes } from './routes/clients.js';
import { connectionRoutes } from './routes/connections.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { healthRoutes } from './routes/health.js';
import { userRoutes } from './routes/users.js';
import { variantRoutes } from './routes/variants.js';
import { reportImportRoutes } from './routes/report-imports.js';
import { insightsRoutes } from './routes/insights.js';
import { performanceRoutes } from './routes/performance.js';
import { analysisRoutes } from './routes/analyses.js';
import { analysisReportRoutes } from './routes/analysis-reports.js';
import { learningRoutes } from './routes/learnings.js';
import { opsRoutes } from './routes/ops.js';
import type { ApiDeps } from './lib/deps.js';

export interface BuildOptions {
  /** `true` usa o logger com redator (Constituição VI); instância própria também vale. */
  logger?: boolean | FastifyBaseLogger;
  corsOrigin?: string;
  docs?: boolean;
}

/** Fábrica testável: nenhuma dependência global, tudo injetado. */
export async function buildApp(deps: ApiDeps, options: BuildOptions = {}): Promise<FastifyInstance> {
  // Fastify 5 recusa instância de logger em `logger`: instância vai em `loggerInstance`.
  const loggerInstance: FastifyBaseLogger | undefined =
    options.logger === true ? redactingLogger('info') : (options.logger || undefined);
  const app = Fastify({
    ...(loggerInstance ? { loggerInstance } : {}),
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });

  registerErrorHandler(app);
  await app.register(cors, {
    origin: options.corsOrigin ?? true,
    credentials: true,
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 50 },
  });
  if (options.docs) await registerOpenApi(app);

  registerAuth(app, deps);

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(
    async (scope) => {
      healthRoutes(scope, deps);
      connectionRoutes(scope, deps);
      whatsappRoutes(scope, deps);
      accountRoutes(scope, deps);
      clientRoutes(scope, deps);
      assetRoutes(scope, deps);
      batchRoutes(scope, deps);
      userRoutes(scope, deps);
      auditRoutes(scope, deps);
      variantRoutes(scope, deps);
      reportImportRoutes(scope, deps);
      insightsRoutes(scope, deps);
      performanceRoutes(scope, deps);
      analysisRoutes(scope, deps);
      analysisReportRoutes(scope, deps);
      learningRoutes(scope, deps);
      opsRoutes(scope, deps);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
