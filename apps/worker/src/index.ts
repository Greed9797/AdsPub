import {
  CONCURRENCY_BY_TIER,
  QUEUES,
  RETRY,
  STATUS_POLL,
  SYNC_EVERY_MS,
  VIDEO_POLL_INTERVAL_MS,
} from '@adpub/config';
import { listConnections, purgeOldMetaCalls } from '@adpub/db';
import { initTelemetry } from '@adpub/telemetry';
import { Queue, Worker, type Job } from 'bullmq';
import { createAlerter } from './alerts.js';
import { createContext } from './context.js';
import { createMetaFactory } from './meta.js';
import { runDriveImport, type DriveImportJobData } from './drive/import.js';
import { runStatusPoll } from './poll/status.js';
import { AccountPausedError, runPublish, type PublishJobData } from './publish/pipeline.js';
import { VideoNotReadyError } from './publish/media.js';
import { RefPendingError } from './publish/refs.js';
import { runSync, type SyncJobData } from './sync/connection.js';

const ctx = createContext();
/** T019: rastros e erros só quando configurados; sem DSN/endpoint é no-op. */
const telemetry = await initTelemetry({
  service: 'adpub-worker',
  sentryDsn: ctx.env.SENTRY_DSN,
  otlpEndpoint: ctx.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  environment: ctx.env.NODE_ENV,
  tracesSampleRate: ctx.env.SENTRY_TRACES_SAMPLE_RATE,
});
const alert = createAlerter(ctx.env.SLACK_WEBHOOK_URL, ctx.log);
const meta = createMetaFactory(ctx, alert);
const connection = ctx.redis;

/** R6: concorrência por tier — Limited publica 1 por vez. */
const publishConcurrency = CONCURRENCY_BY_TIER[ctx.env.META_TIER];

const publishWorker = new Worker<PublishJobData>(
  QUEUES.publish,
  async (job: Job<PublishJobData>) => runPublish(ctx, meta, alert, job.data, job.attemptsMade + 1),
  {
    connection,
    concurrency: publishConcurrency,
    limiter: { max: publishConcurrency, duration: 1000 },
    settings: { backoffStrategy: publishBackoff },
  },
);

/**
 * Vídeo processando e lock de referência não são "erro": reagendam rápido.
 * Conta pausada espera o fim da pausa. O resto usa backoff exponencial.
 */
function publishBackoff(attemptsMade: number, _type?: string, err?: Error): number {
  if (err instanceof VideoNotReadyError) return VIDEO_POLL_INTERVAL_MS;
  if (err instanceof RefPendingError) return 2_000;
  if (err instanceof AccountPausedError) {
    return Math.max(5_000, err.until.getTime() - Date.now());
  }
  return Math.min(RETRY.baseDelayMs * 2 ** Math.max(0, attemptsMade - 1), RETRY.maxDelayMs);
}

const syncWorker = new Worker<SyncJobData>(
  QUEUES.sync,
  async (job: Job<SyncJobData>) => runSync(ctx, meta, alert, job.data),
  { connection, concurrency: 1 },
);

const driveWorker = new Worker<DriveImportJobData>(
  QUEUES.driveImport,
  async (job: Job<DriveImportJobData>) => runDriveImport(ctx, job.data),
  { connection, concurrency: 2 },
);

const statusWorker = new Worker(
  QUEUES.statusPoll,
  async () => {
    const result = await runStatusPoll(ctx, meta);
    await purgeOldMetaCalls(ctx.db, 30);
    return result;
  },
  { connection, concurrency: 1 },
);

const statusQueue = new Queue(QUEUES.statusPoll, { connection });
const syncQueue = new Queue<SyncJobData>(QUEUES.sync, { connection });

for (const worker of [publishWorker, syncWorker, driveWorker, statusWorker]) {
  worker.on('failed', (job, error) => {
    ctx.log.warn(
      { queue: worker.name, job: job?.id, attempts: job?.attemptsMade, err: error.message },
      'job falhou',
    );
    telemetry.captureError(error, { queue: worker.name, job: job?.id, attempts: job?.attemptsMade });
  });
  worker.on('completed', (job) => {
    ctx.log.debug({ queue: worker.name, job: job.id }, 'job concluído');
  });
}

/** Agendadores: poller de revisão e sync periódico da BM. */
async function scheduleRepeatables(): Promise<void> {
  await statusQueue.upsertJobScheduler(
    'status-poll',
    { every: STATUS_POLL.everyMs },
    { name: 'poll' },
  );
  const connections = await listConnections(ctx.db);
  for (const item of connections) {
    if (item.status === 'revoked') continue;
    await syncQueue.upsertJobScheduler(
      `sync:${item.id}`,
      { every: SYNC_EVERY_MS },
      { name: 'sync', data: { connectionId: item.id } },
    );
  }
  ctx.log.info(
    { connections: connections.length, publishConcurrency, tier: ctx.env.META_TIER },
    'worker pronto',
  );
}

await scheduleRepeatables();

async function shutdown(signal: string): Promise<void> {
  ctx.log.info({ signal }, 'encerrando worker');
  await Promise.all([
    publishWorker.close(),
    syncWorker.close(),
    driveWorker.close(),
    statusWorker.close(),
    statusQueue.close(),
    syncQueue.close(),
  ]);
  ctx.redis.disconnect();
  await telemetry.shutdown();
  await ctx.sql.end({ timeout: 5 });
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
