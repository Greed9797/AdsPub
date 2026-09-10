import { and, desc, eq, isNull } from 'drizzle-orm';
import type { BindingPrecision } from '@adpub/shared';
import { adCreativeBindings } from '../schema.js';
import type { Database } from '../client.js';

export type BindingRow = typeof adCreativeBindings.$inferSelect;

export async function activeBindingForDraft(db: Database, draftId: string): Promise<BindingRow | undefined> {
  const [row] = await db
    .select()
    .from(adCreativeBindings)
    .where(and(eq(adCreativeBindings.adDraftId, draftId), isNull(adCreativeBindings.observedTo)))
    .orderBy(desc(adCreativeBindings.observedFrom))
    .limit(1);
  return row;
}

/**
 * T-002-2: abre vínculo fechando o ativo anterior (um ativo por item).
 * Chamar dentro da mesma transação do passo quando houver.
 */
export async function openBinding(
  db: Database,
  input: {
    draftId?: string | null;
    adAccountId: string;
    metaAdId?: string | null;
    metaCreativeId?: string | null;
    variantId: string;
    precision: BindingPrecision;
    ambiguityReason?: string | null;
  },
): Promise<BindingRow> {
  if (input.draftId) {
    await db
      .update(adCreativeBindings)
      .set({ observedTo: new Date() })
      .where(and(eq(adCreativeBindings.adDraftId, input.draftId), isNull(adCreativeBindings.observedTo)));
  }
  const [row] = await db
    .insert(adCreativeBindings)
    .values({
      adDraftId: input.draftId ?? null,
      adAccountId: input.adAccountId,
      metaAdId: input.metaAdId ?? null,
      metaCreativeId: input.metaCreativeId ?? null,
      variantId: input.variantId,
      precision: input.precision,
      ambiguityReason: input.ambiguityReason ?? null,
    })
    .returning();
  if (!row) throw new Error('Falha ao abrir vínculo criativo.');
  return row;
}

export async function closeBinding(db: Database, id: string): Promise<void> {
  await db.update(adCreativeBindings).set({ observedTo: new Date() }).where(eq(adCreativeBindings.id, id));
}

export async function listBindingsForVariant(db: Database, variantId: string): Promise<BindingRow[]> {
  return db
    .select()
    .from(adCreativeBindings)
    .where(eq(adCreativeBindings.variantId, variantId))
    .orderBy(desc(adCreativeBindings.observedFrom))
    .limit(200);
}
