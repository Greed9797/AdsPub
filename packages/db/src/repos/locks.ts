import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { adDrafts } from '../schema.js';
import type { Database } from '../client.js';

/**
 * Constituição III: um item publicável tem **uma execução por vez**.
 *
 * `idempotency_key` e os `meta_ids` salvos protegem a retomada *sequencial*,
 * mas não duas execuções simultâneas do mesmo item — e isso acontece de
 * verdade: o BullMQ reentrega job considerado travado (`stalledInterval`) e um
 * worker reiniciado deixa o anterior terminando. Sem exclusão as duas leem
 * `meta_ids` vazio ao mesmo tempo e criam **dois anúncios** na Meta; o item
 * guarda um `ad_id` e o outro fica órfão, invisível para o produto.
 *
 * Lease em coluna, não lock de conexão: a publicação faz chamadas HTTP de
 * segundos, e segurar uma conexão do pool durante isso esgota o pool quando a
 * concorrência do worker se aproxima do `max`. A expiração cobre o worker que
 * morre sem liberar.
 */
export const DRAFT_LEASE_MS = 10 * 60 * 1000;

/**
 * `owner` precisa ser único **por execução**, não por worker: com
 * `publishConcurrency > 1` duas execuções do mesmo processo compartilhariam o
 * dono e as duas passariam pelo `where`. Por isso não há ramo de reentrância
 * por dono — retomada normal libera no `finally` e crash cai na expiração.
 */
export type DraftClaim = { ok: true } | { ok: false; until: Date | null };

export async function claimDraft(
  db: Database,
  draftId: string,
  owner: string,
  leaseMs: number = DRAFT_LEASE_MS,
): Promise<DraftClaim> {
  const until = new Date(Date.now() + leaseMs);
  const rows = await db
    .update(adDrafts)
    .set({ leaseOwner: owner, leaseUntil: until })
    .where(
      and(
        eq(adDrafts.id, draftId),
        or(isNull(adDrafts.leaseUntil), lt(adDrafts.leaseUntil, sql`now()`)),
      ),
    )
    .returning({ id: adDrafts.id });
  if (rows.length > 0) return { ok: true };

  // Quem perdeu precisa saber até quando esperar: se o dono morrer sem liberar,
  // a retomada só é possível depois da expiração — e esperar não pode consumir
  // as tentativas do job, senão o item morre em `failed` antes da hora.
  const [atual] = await db
    .select({ until: adDrafts.leaseUntil })
    .from(adDrafts)
    .where(eq(adDrafts.id, draftId));
  return { ok: false, until: atual?.until ?? null };
}

export async function releaseDraft(db: Database, draftId: string, owner: string): Promise<void> {
  await db
    .update(adDrafts)
    .set({ leaseOwner: null, leaseUntil: null })
    .where(and(eq(adDrafts.id, draftId), eq(adDrafts.leaseOwner, owner)));
}
