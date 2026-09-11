import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

/** Opt-in explícito: sem esta variável o truncate não roda. */
export const TRUNCATE_OPT_IN = 'ADPUB_ALLOW_TRUNCATE';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Duas condições, ambas obrigatórias, porque isto apaga 19 tabelas e é um
 * entrypoint público do pacote:
 *
 * 1. `ADPUB_ALLOW_TRUNCATE=1` — definido só pelos scripts `smoke:*` e pelo
 *    harness de e2e; nenhum processo de produto o define.
 * 2. A URL aponta para loopback **ou** o banco tem sufixo `_test`/`_e2e`. O
 *    nome `adpub` sozinho não vale nada: é o mesmo em dev e em produção.
 *
 * Ressalva conhecida: um túnel SSH de produção em `localhost` passaria pela
 * regra 2 — a regra 1 é a que impede isso na prática.
 */
export function assertTruncateAllowed(url: string): void {
  if (process.env[TRUNCATE_OPT_IN] !== '1') {
    throw new Error(`truncateAllTables recusado: defina ${TRUNCATE_OPT_IN}=1 para permitir.`);
  }
  const { hostname, pathname } = new URL(url);
  const database = pathname.replace(/^\//, '');
  if (LOOPBACK.has(hostname.toLowerCase())) return;
  if (/_(test|e2e)$/.test(database)) return;
  throw new Error(
    `truncateAllTables recusado: ${hostname}/${database} não é um banco descartável (use loopback ou sufixo _test/_e2e).`,
  );
}

/**
 * Limpa todas as tabelas de dados. Existe para o smoke de integração, para o
 * harness de e2e e para testes locais — nunca é chamado pela API nem pelos
 * workers. A URL vem separada do handle porque é ela que diz para onde a
 * conexão aponta.
 */
export async function truncateAllTables(db: Database, url: string): Promise<void> {
  assertTruncateAllowed(url);
  await db.execute(sql`truncate table
    oauth_tokens, oauth_authorization_codes, oauth_clients,
    audit_log, meta_api_calls, ai_generations, publish_jobs, batch_refs, ad_creative_bindings,
    creative_variants, metric_observations, report_rows, report_imports, report_feedbacks,
    analysis_reports, learnings,
    insight_snapshots, account_sync_state, ad_drafts,
    batches, asset_uploads, assets, user_ad_accounts, users, pixels, adsets_cache,
    campaigns_cache, instagram_accounts, pages, ad_accounts, meta_connections, clients
    restart identity cascade`);
}
