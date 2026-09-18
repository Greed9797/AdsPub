import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { metaWrites } from '../schema.js';
import type { Database } from '../client.js';

export interface LostWrite {
  id: string;
  writeKey: string;
  method: string;
  endpoint: string;
  sentAt: Date;
}

export interface MetaWriteIntent {
  writeKey: string;
  method: string;
  endpoint: string;
  adAccountId?: string | null;
  adDraftId?: string | null;
}

/** Uma criação por etapa do item: a retomada consulta exatamente esta chave. */
export function draftWriteKey(draftId: string, step: string): string {
  return `draft:${draftId}:${step}`;
}

/** Ref compartilhada: quem reassume a posse consulta a escrita do dono anterior. */
export function refWriteKey(batchId: string, refKey: string): string {
  return `ref:${batchId}:${refKey}`;
}

/**
 * Registra a escrita ANTES de sair do app. Sem esta linha, quem retoma depois
 * de uma morte de processo não sabe se o POST chegou à Meta.
 */
export async function beginMetaWrite(db: Database, intent: MetaWriteIntent): Promise<string> {
  const [row] = await db
    .insert(metaWrites)
    .values({
      writeKey: intent.writeKey,
      method: intent.method,
      endpoint: intent.endpoint,
      adAccountId: intent.adAccountId ?? null,
      adDraftId: intent.adDraftId ?? null,
    })
    .returning({ id: metaWrites.id });
  if (!row) throw new Error(`Não foi possível registrar a escrita ${intent.writeKey}.`);
  return row.id;
}

/** Desfecho observado em processo — inclusive falha: o app viu o fim. */
export async function finishMetaWrite(
  db: Database,
  id: string,
  outcome: 'ok' | 'failed',
): Promise<void> {
  await db
    .update(metaWrites)
    .set({ outcome, resolvedAt: new Date() })
    .where(eq(metaWrites.id, id));
}

/** Escrita que saiu sem desfecho conhecido: retomar às cegas duplicaria objeto. */
export async function lostMetaWrite(
  db: Database,
  writeKey: string,
): Promise<LostWrite | undefined> {
  const [row] = await db
    .select({
      id: metaWrites.id,
      writeKey: metaWrites.writeKey,
      method: metaWrites.method,
      endpoint: metaWrites.endpoint,
      sentAt: metaWrites.sentAt,
    })
    .from(metaWrites)
    .where(and(eq(metaWrites.writeKey, writeKey), isNull(metaWrites.resolvedAt)))
    .orderBy(sql`${metaWrites.sentAt} desc`)
    .limit(1);
  return row;
}

/**
 * Decisão humana de reconciliação encerra as escritas perdidas do alvo. Sem
 * isto, o registro que protege contra duplicar viraria bloqueio permanente.
 */
export async function closeLostWrites(
  db: Database,
  target: { writeKey: string } | { adDraftId: string },
): Promise<number> {
  const rows = await db
    .update(metaWrites)
    .set({ outcome: 'resolved', resolvedAt: new Date() })
    .where(
      and(
        isNull(metaWrites.resolvedAt),
        'writeKey' in target
          ? eq(metaWrites.writeKey, target.writeKey)
          : eq(metaWrites.adDraftId, target.adDraftId),
      ),
    )
    .returning({ id: metaWrites.id });
  return rows.length;
}

/**
 * Limpeza do rastro: linha resolvida é histórico e sai com o mesmo horizonte
 * de `meta_api_calls`. Pendente nunca é apagada — é ela que barra o replay.
 */
export async function purgeResolvedMetaWrites(db: Database, days = 30): Promise<void> {
  await db
    .delete(metaWrites)
    .where(
      and(
        isNotNull(metaWrites.resolvedAt),
        sql`${metaWrites.resolvedAt} < now() - ${sql.raw(`interval '${Math.trunc(days)} days'`)}`,
      ),
    );
}
