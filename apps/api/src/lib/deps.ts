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
    jobId: string;
    clientId: string;
    folderUrl: string;
    recursive: boolean;
    actorId: string | null;
  }): Promise<JobRef>;
  enqueuePublish(
    items: Array<{ draftId: string; adAccountId: string; batchId: string }>,
  ): Promise<JobRef[]>;
  /**
   * R3/R4: existe job vivo para este item? Sem isso a retomada manual não
   * sabe distinguir "já está na fila" de "job perdido" e o item em voo fica
   * parado para sempre ou ganha um despacho duplicado.
   */
  publishJobAlive(draftId: string): Promise<boolean>;
  /** A9: enfileira a análise de mídia de um job persistido. */
  enqueueAnalysis(jobId: string): Promise<JobRef>;
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

/**
 * Throttle das tentativas de senha (por e-mail + IP). Erro de infra aqui é
 * fail-closed: a rota responde 429 em vez de liberar sem limite.
 */
export interface LoginThrottle {
  failures(key: string): Promise<number>;
  registerFailure(key: string, windowSeconds: number): Promise<number>;
  clear(key: string): Promise<void>;
}

export interface ApiDeps {
  db: Database;
  storage: Storage;
  queues: Queues;
  ai?: AiClient;
  env: ApiEnv;
  loginThrottle?: LoginThrottle;
  /** Cliente Graph API de leitura para uma conexão (a escrita é só do worker). */
  metaClientFor(connectionId: string): Promise<MetaClient>;
  /** Cliente Graph API para um token cru (usado no teste de conexão). */
  metaClientForToken(token: string): MetaClient;
  verifySession?(token: string): Promise<SessionUser>;
  now?(): Date;
}
