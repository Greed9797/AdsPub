import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definido.');
  process.exit(1);
}

const folder = fileURLToPath(new URL('../migrations', import.meta.url));
const { db, sql } = createDb(url, { max: 1 });

try {
  await migrate(db, { migrationsFolder: folder });
  console.log(`Migrações aplicadas de ${folder}`);
} finally {
  await sql.end({ timeout: 5 });
}
