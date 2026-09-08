import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

/** Opt-in explícito: sem esta variável o truncate não roda. */
export const TRUNCATE_OPT_IN = 'ADPUB_ALLOW_TRUNCATE';

const TEST_DATABASES = new Set(['adpub', 'adpub_e2e', 'adpub_test']);

/**
 * Limpa todas as tabelas de dados. Existe para o smoke de integração, para o
 * harness de e2e e para testes locais — nunca é chamado pela API nem pelos
 * workers.
 *
 * As duas guardas existem porque isto é um entrypoint público do pacote: um
 * `DATABASE_URL` apontado para produção apagaria tudo sem aviso. Exigimos o
 * opt-in `ADPUB_ALLOW_TRUNCATE=1` (só os scripts de fumaça/e2e o definem) e um
 * nome de banco reconhecidamente local (`adpub`, `adpub_e2e`, `*_test`,
 * `*_e2e`).
 */
export async function truncateAllTables(db: Database): Promise<void> {
  if (process.env[TRUNCATE_OPT_IN] !== '1') {
    throw new Error(`truncateAllTables recusado: defina ${TRUNCATE_OPT_IN}=1 para permitir.`);
  }
  const rows = (await db.execute(sql`select current_database() as name`)) as unknown as {
    name: string;
  }[];
  const name = rows[0]?.name ?? '';
  if (!TEST_DATABASES.has(name) && !/_(test|e2e)$/.test(name)) {
    throw new Error(
      `truncateAllTables recusado: banco "${name}" não é de teste (use ${[...TEST_DATABASES].join(', ')} ou sufixo _test/_e2e).`,
    );
  }
  await db.execute(sql`truncate table
    audit_log, meta_api_calls, ai_generations, publish_jobs, batch_refs, ad_drafts,
    batches, asset_uploads, assets, user_ad_accounts, users, pixels, adsets_cache,
    campaigns_cache, instagram_accounts, pages, ad_accounts, meta_connections, clients
    restart identity cascade`);
}
