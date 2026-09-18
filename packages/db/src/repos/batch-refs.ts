import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { batchRefs } from '../schema.js';
import type { BatchRefRow } from '../schema.js';
import type { Database } from '../client.js';

/**
 * Posse da criação de uma ref compartilhada. Mesma razão do lease do item
 * (`DRAFT_LEASE_MS`): a criação é uma chamada HTTP de segundos e o dono pode
 * morrer no meio. Sem expiração, `pending` órfão trava o lote inteiro.
 */
export const REF_CLAIM_MS = 5 * 60 * 1000;

export type ClaimResult =
  | { role: 'owner'; ref: BatchRefRow }
  | { role: 'ready'; metaId: string }
  | { role: 'waiting'; ref: BatchRefRow; until: Date | null }
  | { role: 'blocked'; ref: BatchRefRow };

/**
 * R5: lock para objetos "novos" compartilhados por vários itens.
 * Quem insere primeiro cria na Meta; os demais aguardam o `meta_id`.
 *
 * `blocked` é ref em reconciliação: houve create sem resposta e recriar às
 * cegas duplicaria campanha/conjunto na Meta — só humano libera.
 */
export async function claimRef(
  db: Database,
  input: {
    batchId: string;
    refKey: string;
    kind: 'campaign' | 'adset';
    spec: Record<string, unknown>;
    owner: string;
    leaseMs?: number;
  },
): Promise<ClaimResult> {
  const until = new Date(Date.now() + (input.leaseMs ?? REF_CLAIM_MS));
  const inserted = await db
    .insert(batchRefs)
    .values({
      batchId: input.batchId,
      refKey: input.refKey,
      kind: input.kind,
      spec: input.spec,
      state: 'pending',
      claimOwner: input.owner,
      claimUntil: until,
    })
    .onConflictDoNothing({ target: [batchRefs.batchId, batchRefs.refKey] })
    .returning();

  if (inserted[0]) return { role: 'owner', ref: inserted[0] };

  const existing = await getRef(db, input.batchId, input.refKey);
  if (!existing) throw new Error(`Ref ${input.refKey} desapareceu durante o lock.`);
  if (existing.state === 'created' && existing.metaId) {
    return { role: 'ready', metaId: existing.metaId };
  }
  if (existing.state === 'needs_reconciliation') return { role: 'blocked', ref: existing };

  // Assume a criação quando a tentativa anterior falhou ou quando o dono
  // anterior morreu sem concluir (posse expirada).
  const [retaken] = await db
    .update(batchRefs)
    .set({ state: 'pending', claimOwner: input.owner, claimUntil: until, updatedAt: new Date() })
    .where(
      and(
        eq(batchRefs.batchId, input.batchId),
        eq(batchRefs.refKey, input.refKey),
        or(
          eq(batchRefs.state, 'failed'),
          and(
            eq(batchRefs.state, 'pending'),
            or(isNull(batchRefs.claimUntil), lt(batchRefs.claimUntil, sql`now()`)),
          ),
        ),
      ),
    )
    .returning();
  if (retaken) return { role: 'owner', ref: retaken };
  return { role: 'waiting', ref: existing, until: existing.claimUntil };
}

export async function getRef(
  db: Database,
  batchId: string,
  refKey: string,
): Promise<BatchRefRow | undefined> {
  const [row] = await db
    .select()
    .from(batchRefs)
    .where(and(eq(batchRefs.batchId, batchId), eq(batchRefs.refKey, refKey)));
  return row;
}

export async function markRefCreated(
  db: Database,
  batchId: string,
  refKey: string,
  metaId: string,
): Promise<void> {
  await db
    .update(batchRefs)
    .set({
      metaId,
      state: 'created',
      lastError: null,
      claimOwner: null,
      claimUntil: null,
      updatedAt: new Date(),
    })
    .where(and(eq(batchRefs.batchId, batchId), eq(batchRefs.refKey, refKey)));
}

export async function markRefFailed(
  db: Database,
  batchId: string,
  refKey: string,
  error: string,
): Promise<void> {
  await db
    .update(batchRefs)
    .set({
      state: 'failed',
      lastError: error,
      claimOwner: null,
      claimUntil: null,
      updatedAt: new Date(),
    })
    .where(and(eq(batchRefs.batchId, batchId), eq(batchRefs.refKey, refKey)));
}

/**
 * Create sem resposta em ref compartilhada: o objeto pode existir na Meta.
 * Congela a ref para ninguém recriar; a saída é a decisão humana em
 * `resolveRef`.
 */
export async function markRefReconcile(
  db: Database,
  batchId: string,
  refKey: string,
  error: string,
): Promise<void> {
  await db
    .update(batchRefs)
    .set({
      state: 'needs_reconciliation',
      lastError: error,
      claimOwner: null,
      claimUntil: null,
      updatedAt: new Date(),
    })
    .where(and(eq(batchRefs.batchId, batchId), eq(batchRefs.refKey, refKey)));
}

/**
 * Decisão humana sobre ref em reconciliação: `adopt` fixa o objeto conferido
 * na Meta (nenhum item recria) e `discard` libera a criação de novo.
 */
export async function resolveRef(
  db: Database,
  input:
    | { batchId: string; refKey: string; decision: 'adopt'; metaId: string }
    | { batchId: string; refKey: string; decision: 'discard'; motive: string },
): Promise<BatchRefRow | undefined> {
  const patch =
    input.decision === 'adopt'
      ? { metaId: input.metaId, state: 'created' as const, lastError: null }
      : { state: 'failed' as const, lastError: input.motive };
  const [row] = await db
    .update(batchRefs)
    .set({ ...patch, claimOwner: null, claimUntil: null, updatedAt: new Date() })
    .where(
      and(
        eq(batchRefs.batchId, input.batchId),
        eq(batchRefs.refKey, input.refKey),
        eq(batchRefs.state, 'needs_reconciliation'),
      ),
    )
    .returning();
  return row;
}

export async function listRefs(db: Database, batchId: string): Promise<BatchRefRow[]> {
  return db.select().from(batchRefs).where(eq(batchRefs.batchId, batchId));
}
