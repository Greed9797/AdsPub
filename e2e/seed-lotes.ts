/**
 * Semeia lotes com anúncios em estados variados direto no banco do e2e. O fluxo
 * real leva minutos por lote; a lista só precisa ler o que a API devolve, então
 * a semente escreve as linhas que o worker e a revisão escreveriam.
 */
import { randomUUID } from 'node:crypto';

import { adDrafts, batches, createDb } from '@adpub/db';
import type { AdDraftStatus } from '@adpub/shared';

import { approvalFingerprint } from '../apps/api/src/services/approval.js';
import { E2E_DATABASE, POSTGRES_BASE_URL } from './env.js';
import type { SeedData } from './seed-handoff.js';

export interface LoteSemeado {
  nome: string;
  status: 'draft' | 'ready' | 'queued' | 'publishing' | 'done' | 'partial';
  anuncios: AdDraftStatus[];
  /** Grava a aprovação válida, o que põe o lote na fila de publicação. */
  aprovado?: boolean;
}

export async function semearLotes(seed: SeedData, lotes: readonly LoteSemeado[]): Promise<string[]> {
  const { db, sql } = createDb(`${POSTGRES_BASE_URL}/${E2E_DATABASE}`, { max: 1, onNotice: () => {} });
  const ids: string[] = [];
  try {
    for (const lote of lotes) {
      const batchId = randomUUID();
      const itens = lote.anuncios.map((status, position) => ({
        id: randomUUID(),
        batchId,
        position,
        campaignRef: { kind: 'new' as const, key: 'c1' },
        adsetRef: { kind: 'new' as const, key: 'a1' },
        format: 'single_image' as const,
        assetIds: [seed.asset.id],
        copy: { primary_text: 'Texto', headline: '', description: '', cta: 'SHOP_NOW' as const, link: '', display_link: '', url_tags: '' },
        name: `${lote.nome} · ${position + 1}`,
        pageId: seed.account.pageId,
        status,
        metaIds: { image_hashes: {}, video_ids: {}, thumbnail_hashes: {} },
        idempotencyKey: `${batchId}:${position}`,
      }));
      const fingerprint = lote.aprovado
        ? approvalFingerprint(itens.map((item) => ({ ...item, igUserId: null })))
        : null;
      await db.insert(batches).values({
        id: batchId,
        clientId: seed.client.id,
        adAccountId: seed.account.id,
        name: lote.nome,
        mode: 'manual',
        status: lote.status,
        options: { initial_status: 'PAUSED', max_items: 200, dry_run: false },
        approvalFingerprint: fingerprint,
        validatedAt: lote.aprovado ? new Date() : null,
      });
      if (itens.length > 0) await db.insert(adDrafts).values(itens);
      ids.push(batchId);
    }
  } finally {
    await sql.end();
  }
  return ids;
}
