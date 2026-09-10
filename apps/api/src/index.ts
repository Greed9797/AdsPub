import { AiClient, anthropicInvoker } from '@adpub/ai';
import { loadServerEnv } from '@adpub/config';
import { createDb, getConnectionToken, recordMetaCall } from '@adpub/db';
import { MetaClient } from '@adpub/meta-client';
import { Storage } from '@adpub/storage';
import { initTelemetry, redactingLogger } from '@adpub/telemetry';
import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { aiCacheFor } from './services/batch-plan.js';
import { createQueues } from './queues.js';
import type { ApiDeps } from './lib/deps.js';

const env = loadServerEnv();
/** T019: rastros e erros só quando configurados; sem DSN/endpoint é no-op. */
const telemetry = await initTelemetry({
  service: 'adpub-api',
  sentryDsn: env.SENTRY_DSN,
  otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  environment: env.NODE_ENV,
  tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
});
const { db, sql } = createDb(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queues = createQueues(redis);
const storage = new Storage({
  endpoint: env.S3_ENDPOINT,
  bucket: env.S3_BUCKET,
  region: env.S3_REGION,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
});

function metaClientWith(token: string, connectionId?: string): MetaClient {
  return new MetaClient({
    version: env.META_API_VERSION,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    baseUrl: env.META_BASE_URL,
    token,
    onCall: (log) => {
      void recordMetaCall(db, {
        method: log.method,
        endpoint: log.endpoint,
        apiVersion: log.apiVersion,
        statusCode: log.statusCode,
        latencyMs: log.latencyMs,
        errorCode: log.errorCode ?? null,
        errorSubcode: log.errorSubcode ?? null,
        usage: { connection_id: connectionId ?? null },
      }).catch(() => undefined);
    },
  });
}

const deps: ApiDeps = {
  db,
  storage,
  queues,
  env: {
    authSecret: env.AUTH_SECRET,
    allowedDomain: env.AUTH_ALLOWED_DOMAIN,
    metaApiVersion: env.META_API_VERSION,
    metaTier: env.META_TIER,
    usePolicyAi: true,
    featureAiAnalysis: env.FEATURE_AI_ANALYSIS === '1',
    featureReports: env.FEATURE_REPORTS === '1',
    featureInsights: env.FEATURE_INSIGHTS === '1',
  },
  async metaClientFor(connectionId: string) {
    const token = await getConnectionToken(db, connectionId);
    if (!token) throw new Error(`Conexão ${connectionId} sem token utilizável.`);
    return metaClientWith(token, connectionId);
  },
  metaClientForToken(token: string) {
    return metaClientWith(token);
  },
};

// R14: o cache de gerações precisa do próprio `deps` (db) já montado.
deps.ai = new AiClient({
  invoke: anthropicInvoker(env.ANTHROPIC_API_KEY),
  models: { generation: env.AI_MODEL_GENERATION, classify: env.AI_MODEL_CLASSIFY },
  timeoutMs: env.AI_PLAN_TIMEOUT_MS,
  cache: aiCacheFor(deps, null),
});

const app = await buildApp(deps, { logger: redactingLogger(env.LOG_LEVEL), docs: true, corsOrigin: env.WEB_URL });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'encerrando API');
  await app.close();
  await queues.close();
  await telemetry.shutdown();
  redis.disconnect();
  await sql.end({ timeout: 5 });
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
