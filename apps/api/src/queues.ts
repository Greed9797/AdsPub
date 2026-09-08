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

/** Produtores BullMQ. O consumo (workers) vive em apps/worker. */
export function createQueues(connection: Redis): Queues {
  const publish = new Queue<PublishJobData>(QUEUES.publish, { connection });
  const sync = new Queue<SyncJobData>(QUEUES.sync, { connection });
  const drive = new Queue<DriveImportJobData>(QUEUES.driveImport, { connection });

  const defaultJobOptions = {
    attempts: RETRY.maxAttempts,
    backoff: { type: 'exponential' as const, delay: RETRY.baseDelayMs },
    removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  };

  return {
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
    async close() {
      await Promise.all([publish.close(), sync.close(), drive.close()]);
    },
  };
}
