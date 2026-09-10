import { createHash } from 'node:crypto';
import type { AdDraftRow } from '@adpub/db';
import { stableJson, type AdDraftStatus } from '@adpub/shared';

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
