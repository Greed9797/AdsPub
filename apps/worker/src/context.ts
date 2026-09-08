import { loadServerEnv, type ServerEnv } from '@adpub/config';
import { createDb, type Database } from '@adpub/db';
import { Storage } from '@adpub/storage';
import { Redis } from 'ioredis';
import pino, { type Logger } from 'pino';
import type { Sql } from 'postgres';

export interface WorkerContext {
  env: ServerEnv;
  db: Database;
  sql: Sql;
  redis: Redis;
  storage: Storage;
  log: Logger;
  /** Injetado apenas por testes de contrato/fumaça; em produção fica undefined. */
  fetchImpl?: typeof fetch;
}

export function createContext(): WorkerContext {
  const env = loadServerEnv();
  const { db, sql } = createDb(env.DATABASE_URL);
  return {
    env,
    db,
    sql,
    redis: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    storage: new Storage({
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
    }),
    log: pino({
      level: env.LOG_LEVEL,
      // Constituição VI: nenhum token em log.
      redact: {
        paths: ['token', '*.token', 'access_token', '*.access_token', 'appsecret_proof'],
        censor: '[redacted]',
      },
    }),
  };
}
