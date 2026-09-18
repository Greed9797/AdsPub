import { QUEUES, RETRY } from '@adpub/config';
import { Queue, type Job, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobRef, Queues } from './lib/deps.js';

/** Estados em que o job ainda vai rodar: pedir de novo é redundante. */
const LIVE_STATES: ReadonlySet<string> = new Set([
  'waiting',
  'waiting-children',
  'prioritized',
  'delayed',
  'active',
  'paused',
]);

/**
 * Um job por item. O `:` é proibido em id custom no BullMQ (`Custom Id cannot
 * contain :`), então o separador é `-` — com `:` toda publicação estourava
 * antes de entrar na fila.
 */
function publishJobId(draftId: string): string {
  return `draft-${draftId}`;
}

/**
 * Despacho com id estável (um job por entidade). O registro do job anterior
 * fica retido para histórico e o BullMQ ignora `add` com id existente — sem
 * limpar o registro já encerrado, reprocessar virava silêncio: item em
 * `queued` e nenhum job para executá-lo. Job ainda vivo não é substituído: o
 * pedido é redundante e quem garante execução única é o lease no banco.
 */
async function dispatch<T>(
  queue: {
    name: string;
    getJob(id: string): Promise<Job<T> | undefined>;
    add(name: string, data: T, opts: JobsOptions): Promise<Job<T>>;
  },
  jobId: string,
  name: string,
  data: T,
  opts: JobsOptions,
): Promise<JobRef> {
  const anterior: Job<T> | undefined = await queue.getJob(jobId);
  if (anterior) {
    const estado = await anterior.getState();
    if (LIVE_STATES.has(estado)) return { job_id: String(anterior.id), queue: queue.name };
    try {
      await anterior.remove();
    } catch {
      // Virou ativo entre a leitura e a remoção: já está sendo executado.
      return { job_id: String(anterior.id), queue: queue.name };
    }
  }
  const job = await queue.add(name, data, { ...opts, jobId });
  return { job_id: String(job.id), queue: queue.name };
}

export interface PublishJobData {
  draftId: string;
  adAccountId: string;
  batchId: string;
}

export interface SyncJobData {
  connectionId: string;
}

export interface DriveImportJobData {
  jobId: string;
  clientId: string;
  folderUrl: string;
  recursive: boolean;
  actorId: string | null;
}

export interface AnalysisJobData {
  jobId: string;
}

export interface InsightsSyncJobData {
  adAccountId: string;
  since: string;
  until: string;
  backfill?: boolean;
}

/** Produtores BullMQ. O consumo (workers) vive em apps/worker. */
export function createQueues(connection: Redis): Queues {
  const publish = new Queue<PublishJobData>(QUEUES.publish, { connection });
  const sync = new Queue<SyncJobData>(QUEUES.sync, { connection });
  const drive = new Queue<DriveImportJobData>(QUEUES.driveImport, { connection });
  const insights = new Queue<InsightsSyncJobData>(QUEUES.insightsSync, { connection });
  // A9: análise de mídia em fila própria — ffmpeg e IA fora da requisição.
  const analysis = new Queue<AnalysisJobData>(QUEUES.analysis, { connection });

  const defaultJobOptions = {
    attempts: RETRY.maxAttempts,
    backoff: { type: 'exponential' as const, delay: RETRY.baseDelayMs },
    removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  };

  return {
    async enqueueAnalysis(jobId) {
      // Chave por job do banco: reentrega do Redis não vira segunda cobrança
      // de IA, porque o worker confere o estado da linha antes de rodar.
      return dispatch(analysis, `analysis-${jobId}`, 'analysis', { jobId }, defaultJobOptions);
    },
    async enqueueSync(connectionId) {
      // Id estável por conexão: dois cliques em "Sincronizar" não viram dois
      // inventários concorrentes da mesma BM. O sync é idempotente (upserts),
      // então job vivo é reaproveitado e job encerrado é re-despachado.
      return dispatch(
        sync,
        `sync-${connectionId}`,
        'sync',
        { connectionId },
        defaultJobOptions,
      );
    },
    async enqueueImportDrive(input) {
      // Chave por linha do banco: dois POSTs da mesma pasta voltam ao job
      // vivo em vez de enfileirar a importação duas vezes.
      return dispatch(drive, `drive-${input.jobId}`, 'import', input, defaultJobOptions);
    },
    async enqueuePublish(items) {
      if (items.length === 0) return [];
      return Promise.all(
        items.map((item) => dispatch(publish, publishJobId(item.draftId), 'publish', item, defaultJobOptions)),
      );
    },
    async publishJobAlive(draftId) {
      const job = await publish.getJob(publishJobId(draftId));
      if (!job) return false;
      return LIVE_STATES.has(await job.getState());
    },
    async enqueueInsights(input) {
      return dispatch(
        insights,
        `insights-${input.adAccountId}-${input.since}-${input.until}`,
        'sync',
        input,
        defaultJobOptions,
      );
    },
    async queueCounts() {
      const entries = await Promise.all(
        [publish, sync, drive, insights, analysis].map(
          async (queue) => [queue.name, await queue.getJobCounts()] as const,
        ),
      );
      return Object.fromEntries(entries);
    },
    async close() {
      await Promise.all([publish.close(), sync.close(), drive.close(), insights.close(), analysis.close()]);
    },
  };
}
