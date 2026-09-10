import type { AiClient } from '@adpub/ai';
import type { Database } from '@adpub/db';
import type { MetaClient } from '@adpub/meta-client';
import type { SessionUser } from '@adpub/shared';
import type { Storage } from '@adpub/storage';

export interface JobRef {
  job_id: string;
  queue: string;
}

/** Produtores de fila — abstraídos para permitir teste sem Redis. */
export interface Queues {
  enqueueSync(connectionId: string): Promise<JobRef>;
  enqueueImportDrive(input: {
    clientId: string;
    folderUrl: string;
    recursive: boolean;
    actorId: string | null;
  }): Promise<JobRef>;
  enqueuePublish(
    items: Array<{ draftId: string; adAccountId: string; batchId: string }>,
  ): Promise<JobRef[]>;
  enqueueInsights(input: {
    adAccountId: string;
    since: string;
    until: string;
    backfill?: boolean;
  }): Promise<JobRef>;
  queueCounts(): Promise<Record<string, Record<string, number>>>;
  close(): Promise<void>;
}

export interface ApiEnv {
  authSecret: string;
  allowedDomain: string;
  metaApiVersion: string;
  metaTier: 'limited' | 'full';
  usePolicyAi: boolean;
  /** T-009-3: desligam inteligência; publish nunca consulta. */
  featureAiAnalysis: boolean;
  featureReports: boolean;
  featureInsights: boolean;
}

export interface ApiDeps {
  db: Database;
  storage: Storage;
  queues: Queues;
  ai?: AiClient;
  env: ApiEnv;
  /** Cliente Graph API de leitura para uma conexão (a escrita é só do worker). */
  metaClientFor(connectionId: string): Promise<MetaClient>;
  /** Cliente Graph API para um token cru (usado no teste de conexão). */
  metaClientForToken(token: string): MetaClient;
  verifySession?(token: string): Promise<SessionUser>;
  now?(): Date;
}
