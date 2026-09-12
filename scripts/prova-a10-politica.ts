/**
 * Prova do achado A10 (contrato de indisponibilidade): cliente em modo
 * `block` com classificador fora do ar NÃO pode passar como "validado só por
 * regras" — o item fica bloqueado para revisão humana. Antes, o catch
 * transformava indisponibilidade em aviso em qualquer modo.
 *
 * Escreve no banco local de desenvolvimento (valida o primeiro lote do
 * primeiro cliente e alterna `policy_mode`, restaurando no fim).
 *
 *   DATABASE_URL=postgres://adpub:adpub@localhost:55432/adpub pnpm prova:a10
 */
import { AiClient } from '@adpub/ai';
import { createDb } from '@adpub/db';
import { validateBatch } from '../apps/api/src/services/validation.js';
import type { ApiDeps } from '../apps/api/src/lib/deps.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL ausente');
const { db, sql } = createDb(url);

const client = await sql`select id, policy_mode from clients limit 1`.then((rows) => rows[0]);
const batch = await sql`
  select b.id, b.client_id from batches b
  where b.client_id = ${client!.id}
    and exists (
      select 1 from ad_drafts d
      where d.batch_id = b.id
        and d.status not in ('queued', 'published', 'in_review', 'approved', 'disapproved')
    )
  limit 1
`.then((rows) => rows[0]);
if (!batch) throw new Error('nenhum lote com rascunho para a prova');

let calls = 0;
const deps = {
  db,
  env: { usePolicyAi: true },
  now: () => new Date(),
} as unknown as ApiDeps;
deps.ai = new AiClient({
  invoke: async () => {
    calls += 1;
    throw new Error('classificador fora do ar (prova A10)');
  },
  models: { generation: 'claude-sonnet-4-6', classify: 'claude-haiku-4-5' },
});

const actor = { id: null, email: 'prova@local', role: 'admin' } as never;

try {
  await sql`update clients set policy_mode = 'warn' where id = ${client!.id}`;
  const warnReport = await validateBatch(deps, actor, batch.id);
  const warnItem = warnReport.items[0]!;

  await sql`update clients set policy_mode = 'block' where id = ${client!.id}`;
  const blockReport = await validateBatch(deps, actor, batch.id);
  const blockItem = blockReport.items[0]!;

  const warnOk = warnItem.warnings.some((w) => w.code === 'policy.ai_unavailable');
  const blockOk = blockItem.errors.some((e) => e.code === 'policy.ai_unavailable');
  console.log(`chamadas ao classificador: ${calls}`);
  console.log(
    warnOk ? 'OK: modo warn trata indisponibilidade como aviso' : `FALHA: warn=${JSON.stringify(warnItem)}`,
  );
  console.log(
    blockOk ? `OK: modo block bloqueia o item (${blockItem.status})` : `FALHA: block=${JSON.stringify(blockItem)}`,
  );
  console.log(
    !blockReport.can_publish ? 'OK: lote não publicável com item bloqueado' : 'FALHA: can_publish true',
  );
} finally {
  await sql`update clients set policy_mode = 'warn' where id = ${client!.id}`;
  await sql.end({ timeout: 5 });
}
