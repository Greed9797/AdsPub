import { createHash } from 'node:crypto';
import { patchBatch, type AdDraftRow } from '@adpub/db';
import { stableJson, type AdDraftStatus } from '@adpub/shared';
import type { ApiDeps } from '../lib/deps.js';

/**
 * T-000-3 (AC-000-04): fingerprint da revisão aprovada. Cobre conteúdo
 * publicável (id, copy, nome, refs, formato, assets, destino) — não status nem
 * versão: transições de fila/retry não invalidam aprovação, edição sim.
 * Universo = itens `ready` + `failed` ordenados por id (determinístico).
 */
export type FingerprintDraft = Pick<
  AdDraftRow,
  'id' | 'copy' | 'name' | 'campaignRef' | 'adsetRef' | 'format' | 'assetIds' | 'pageId' | 'igUserId' | 'status'
>;

const FINGERPRINT_STATUSES: ReadonlySet<AdDraftStatus> = new Set(['ready', 'failed']);

export function approvalFingerprint(drafts: readonly FingerprintDraft[]): string {
  const eligible = drafts
    .filter((d) => FINGERPRINT_STATUSES.has(d.status as AdDraftStatus))
    .map((d) => ({
      id: d.id,
      copy: d.copy,
      name: d.name,
      campaignRef: d.campaignRef,
      adsetRef: d.adsetRef,
      format: d.format,
      assetIds: d.assetIds,
      pageId: d.pageId,
      igUserId: d.igUserId,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return createHash('sha256').update(stableJson(eligible)).digest('hex');
}

/** Itens que a revisão pode editar/remover: nada em voo nem já publicado. */
export const EDITABLE_STATUSES: ReadonlySet<AdDraftStatus> = new Set([
  'draft',
  'blocked',
  'ready',
  'failed',
]);

/**
 * Mexer no conteúdo derruba a aprovação: sem isto o lote continuava marcado
 * como validado depois da edição e só o fingerprint (invisível na tela)
 * segurava a publicação.
 *
 * `validatedAt` fica: é a data da última validação, e é ela que permite a tela
 * dizer "mudou depois de validar" em vez de "nunca foi validado".
 */
export async function invalidateApproval(deps: ApiDeps, batchId: string): Promise<void> {
  await patchBatch(deps.db, batchId, { approvalFingerprint: null });
}
