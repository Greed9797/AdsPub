import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { stableJson, variantManifestSchema, type VariantManifest } from '@adpub/shared';
import { creativeVariants } from '../schema.js';
import type { Database } from '../client.js';

export type VariantRow = typeof creativeVariants.$inferSelect;

/** Fingerprint da composição. Nome do item fica de fora: rótulo ≠ identidade. */
export function variantFingerprint(manifest: VariantManifest): string {
  return createHash('sha256').update(stableJson(variantManifestSchema.parse(manifest))).digest('hex');
}

/**
 * T-002-1: get-or-create por (cliente, fingerprint). Concorrência resolve no
 * unique — segundo insert falha e relê a linha vencedora.
 */
export async function getOrCreateVariant(
  db: Database,
  clientId: string,
  manifest: VariantManifest,
): Promise<VariantRow> {
  const parsed = variantManifestSchema.parse(manifest);
  const fingerprint = variantFingerprint(parsed);
  const [existing] = await db
    .select()
    .from(creativeVariants)
    .where(and(eq(creativeVariants.clientId, clientId), eq(creativeVariants.fingerprint, fingerprint)));
  if (existing) return existing;
  try {
    const [created] = await db
      .insert(creativeVariants)
      .values({ clientId, fingerprint, manifest: parsed })
      .returning();
    if (!created) throw new Error('Falha ao criar variante.');
    return created;
  } catch {
    const [winner] = await db
      .select()
      .from(creativeVariants)
      .where(and(eq(creativeVariants.clientId, clientId), eq(creativeVariants.fingerprint, fingerprint)));
    if (!winner) throw new Error('Falha ao criar variante.');
    return winner;
  }
}

export async function listVariants(
  db: Database,
  filter: { clientId: string; format?: VariantRow['manifest']['format']; q?: string; limit?: number },
): Promise<VariantRow[]> {
  const rows = await db
    .select()
    .from(creativeVariants)
    .where(eq(creativeVariants.clientId, filter.clientId))
    .orderBy(creativeVariants.createdAt)
    .limit(Math.min(filter.limit ?? 100, 500));
  return rows.filter((row) => {
    if (filter.format && row.manifest.format !== filter.format) return false;
    if (filter.q) {
      const hay = `${row.manifest.copy.primary_text}\n${row.manifest.copy.headline}`.toLowerCase();
      if (!hay.includes(filter.q.toLowerCase())) return false;
    }
    return true;
  });
}
