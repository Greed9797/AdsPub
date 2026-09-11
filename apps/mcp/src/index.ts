import { createDb, pruneOAuth } from '@adpub/db';
import { buildMcpApp } from './app.js';
import { mcpConfig } from './config.js';

/**
 * Servidor MCP do AdPub: expõe as ferramentas para clientes como o ChatGPT no
 * mesmo host público do app (o Caddy encaminha `/mcp` e as rotas OAuth).
 */
const config = mcpConfig();
const { db, sql } = createDb(config.databaseUrl, { max: 5 });

await pruneOAuth(db);

const app = await buildMcpApp({ db, config });
await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info({ port: config.port, resource: config.publicUrl.href }, 'MCP no ar');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void (async () => {
      await app.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
