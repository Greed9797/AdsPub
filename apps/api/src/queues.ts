import { QUEUES, RETRY } from '@adpub/config';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobRef, Queues } from './lib/deps.js';

export interface PublishJobData {
  draftId: string;
  adAccountId: string;
  batchId: string;
}

export interface SyncJobData {
  connectionId: string;
}

export interface DriveImportJobData {
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
      const job = await analysis.add(
        'analysis',
        { jobId },
        // Chave por job do banco: reentrega do Redis não vira segunda cobrança
        // de IA, porque o worker confere o estado da linha antes de rodar.
        { ...defaultJobOptions, jobId: `analysis:${jobId}` },
      );
      return { job_id: String(job.id), queue: QUEUES.analysis };
    },
    async enqueueSync(connectionId) {
      const job = await sync.add('sync', { connectionId }, { ...defaultJobOptions, jobId: `sync:${connectionId}:${Date.now()}` });
      return { job_id: String(job.id), queue: QUEUES.sync };
    },
    async enqueueImportDrive(input) {
      const job = await drive.add('import', input, defaultJobOptions);
      return { job_id: String(job.id), queue: QUEUES.driveImport };
    },
    async enqueuePublish(items) {
      if (items.length === 0) return [];
      const added = await publish.addBulk(
        items.map((item) => ({
          name: 'publish',
          data: item,
          opts: { ...defaultJobOptions, jobId: `draft:${item.draftId}` },
        })),
      );
      return added.map<JobRef>((job) => ({ job_id: String(job.id), queue: QUEUES.publish }));
    },
    async enqueueInsights(input) {
      const job = await insights.add('sync', input, {
        ...defaultJobOptions,
        jobId: `insights:${input.adAccountId}:${input.since}:${input.until}`,
      });
      return { job_id: String(job.id), queue: QUEUES.insightsSync };
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
