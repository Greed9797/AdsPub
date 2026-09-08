import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

/**
 * Limpa todas as tabelas de dados. Existe para o smoke de integração e para
 * testes locais — nunca é chamado pela API nem pelos workers.
 */
export async function truncateAllTables(db: Database): Promise<void> {
  await db.execute(sql`truncate table
    audit_log, meta_api_calls, ai_generations, publish_jobs, batch_refs, ad_drafts,
    batches, asset_uploads, assets, user_ad_accounts, users, pixels, adsets_cache,
    campaigns_cache, instagram_accounts, pages, ad_accounts, meta_connections, clients
    restart identity cascade`);
}
