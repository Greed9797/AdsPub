import {
  ANALYSIS_CONCURRENCY,
  CONCURRENCY_BY_TIER,
  QUEUES,
  RETRY,
  STATUS_POLL,
  VIDEO_POLL_INTERVAL_MS,
} from '@adpub/config';
import { purgeOldMetaCalls, purgeResolvedMetaWrites } from '@adpub/db';
import { initTelemetry } from '@adpub/telemetry';
import { Queue, Worker, type Job } from 'bullmq';
import { createAlerter, telegramFromEnv } from './alerts.js';
import { createWorkerAi } from './ai.js';
import { runAnalysis } from './analysis/run.js';
import { createContext } from './context.js';
import { createMetaFactory } from './meta.js';
import { runDriveImport, type DriveImportJobData } from './drive/import.js';
import { runStatusPoll } from './poll/status.js';
import { AccountPausedError, type PublishJobData } from './publish/pipeline.js';
import { createPublishProcessor } from './publish/handler.js';
import { VideoNotReadyError } from './publish/media.js';
import { RefPendingError } from './publish/refs.js';
import { runSync, type SyncJobData } from './sync/connection.js';
import { reconcileSyncSchedulers } from './sync/schedule.js';
import { runInsightsSync, type InsightsSyncData } from './insights/sync.js';

const ctx = createContext();
/** IA do worker: só contabilidade compartilhada com a API; sem cache de plano. */
const workerAi = createWorkerAi(ctx);
/** T019: rastros só quando configurados; sem endpoint é no-op. */
const telemetry = await initTelemetry({
  service: 'adpub-worker',
  otlpEndpoint: ctx.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});
const alert = createAlerter(telegramFromEnv(ctx.env), ctx.log);
const meta = createMetaFactory(ctx, alert);
const connection = ctx.redis;

/** R6: concorrência por tier — Limited publica 1 por vez. */
const publishConcurrency = CONCURRENCY_BY_TIER[ctx.env.META_TIER];

const publishWorker = new Worker<PublishJobData>(
  QUEUES.publish,
  createPublishProcessor(ctx, meta, alert),
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
 * `DraftBusyError` não chega aqui: é reagendado sem consumir tentativa.
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
    await purgeResolvedMetaWrites(ctx.db, 30);
    // Mesmo tique que já roda de 10 em 10 minutos mantém o agendamento de sync
    // em dia: conexão nova entra no ciclo sem reiniciar o worker.
    await reconcileSyncSchedulers(ctx.db, syncQueue);
    return result;
  },
  { connection, concurrency: 1 },
);

/**
 * A9: ffmpeg + IA de análise numa fila própria, uma por vez. Nem a API nem a
 * publicação competem com o processamento de mídia.
 */
const analysisWorker = new Worker<{ jobId: string }>(
  QUEUES.analysis,
  async (job: Job<{ jobId: string }>) => runAnalysis(ctx, workerAi, job.data),
  { connection, concurrency: ANALYSIS_CONCURRENCY },
);

/** T-004-3: fila separada do publish — vídeo/IA nunca travam publicação (009). */
const insightsWorker = new Worker<InsightsSyncData>(
  QUEUES.insightsSync,
  async (job: Job<InsightsSyncData>) => runInsightsSync(ctx, meta, alert, job.data),
  { connection, concurrency: 1 },
);

const statusQueue = new Queue(QUEUES.statusPoll, { connection });
const syncQueue = new Queue<SyncJobData>(QUEUES.sync, { connection });

for (const worker of [
  publishWorker,
  syncWorker,
  driveWorker,
  statusWorker,
  insightsWorker,
  analysisWorker,
]) {
  worker.on('failed', (job, error) => {
    ctx.log.warn(
      { queue: worker.name, job: job?.id, attempts: job?.attemptsMade, err: error.message },
      'job falhou',
    );
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
  const connections = await reconcileSyncSchedulers(ctx.db, syncQueue);
  ctx.log.info(
    { connections, publishConcurrency, tier: ctx.env.META_TIER },
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
    insightsWorker.close(),
    analysisWorker.close(),
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
