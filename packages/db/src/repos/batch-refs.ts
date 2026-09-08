import { and, eq } from 'drizzle-orm';
import { batchRefs } from '../schema.js';
import type { BatchRefRow } from '../schema.js';
import type { Database } from '../client.js';

export type ClaimResult =
  | { role: 'owner'; ref: BatchRefRow }
  | { role: 'ready'; metaId: string }
  | { role: 'waiting'; ref: BatchRefRow };

/**
 * R5: lock para objetos "novos" compartilhados por vários itens.
 * Quem insere primeiro cria na Meta; os demais aguardam o `meta_id`.
 */
export async function claimRef(
  db: Database,
  input: {
    batchId: string;
    refKey: string;
    kind: 'campaign' | 'adset';
    spec: Record<string, unknown>;
  },
): Promise<ClaimResult> {
  const inserted = await db
    .insert(batchRefs)
    .values({
      batchId: input.batchId,
      refKey: input.refKey,
      kind: input.kind,
      spec: input.spec,
      state: 'pending',
    })
    .onConflictDoNothing({ target: [batchRefs.batchId, batchRefs.refKey] })
    .returning();

  if (inserted[0]) return { role: 'owner', ref: inserted[0] };

  const existing = await getRef(db, input.batchId, input.refKey);
  if (!existing) throw new Error(`Ref ${input.refKey} desapareceu durante o lock.`);
  if (existing.state === 'created' && existing.metaId) {
    return { role: 'ready', metaId: existing.metaId };
  }
  // Uma tentativa anterior falhou: quem chegar depois assume a criação.
  if (existing.state === 'failed') {
    const [retaken] = await db
      .update(batchRefs)
      .set({ state: 'pending', updatedAt: new Date() })
      .where(
        and(
          eq(batchRefs.batchId, input.batchId),
          eq(batchRefs.refKey, input.refKey),
          eq(batchRefs.state, 'failed'),
        ),
      )
      .returning();
    if (retaken) return { role: 'owner', ref: retaken };
  }
  return { role: 'waiting', ref: existing };
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
    .set({ metaId, state: 'created', lastError: null, updatedAt: new Date() })
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
    .set({ state: 'failed', lastError: error, updatedAt: new Date() })
    .where(and(eq(batchRefs.batchId, batchId), eq(batchRefs.refKey, refKey)));
}

export async function listRefs(db: Database, batchId: string): Promise<BatchRefRow[]> {
  return db.select().from(batchRefs).where(eq(batchRefs.batchId, batchId));
}
