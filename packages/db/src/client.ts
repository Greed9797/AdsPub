import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadServerEnv } from '@adpub/config';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDb>['db'];

export function createDb(
  url: string,
  options: { max?: number; onNotice?: (notice: unknown) => void } = {},
) {
  const sql = postgres(url, {
    max: options.max ?? 10,
    prepare: false,
    // Sem handler, notices do Postgres iriam para o stdout crus.
    onnotice: options.onNotice ?? (() => {}),
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

let cached: { db: Database; sql: postgres.Sql } | undefined;

export function getDb(): Database {
  if (!cached) cached = createDb(loadServerEnv().DATABASE_URL);
  return cached.db;
}

export async function closeDb(): Promise<void> {
  if (cached) {
    await cached.sql.end({ timeout: 5 });
    cached = undefined;
  }
}
