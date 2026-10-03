/**
 * Semeia lotes com anúncios em estados variados direto no banco do e2e. O fluxo
 * real leva minutos por lote; a lista só precisa ler o que a API devolve, então
 * a semente escreve as linhas que o worker e a revisão escreveriam.
 */
import { randomUUID } from 'node:crypto';

import { adDrafts, batchRefs, batches, createDb, userAdAccounts, users } from '@adpub/db';
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
  /** Campanha `c1` e conjunto `a1` do lote, no estado pedido. */
  refs?: { campanha: 'pending' | 'created' | 'failed' | 'needs_reconciliation'; conjunto: 'pending' | 'created' | 'failed' | 'needs_reconciliation' };
  /** Etapa gravada em cada anúncio (padrão: a primeira). */
  etapa?: 'upload_media' | 'ensure_campaign' | 'ensure_adset' | 'create_creative' | 'create_ad' | 'done';
}

type Papel = SeedData['admin']['role'];

/** Usuário ativo com o papel pedido e acesso às contas dadas (papéis abaixo de coordenador só veem as suas). A API lê o papel do banco, não do token. */
export async function semearUsuario(papel: Papel, contas: readonly string[] = []): Promise<SeedData['admin']> {
  const { db, sql } = createDb(`${POSTGRES_BASE_URL}/${E2E_DATABASE}`, { max: 1, onNotice: () => {} });
  try {
    const email = `rds-${papel}@empresa.com.br`;
    const [linha] = await db
      .insert(users)
      .values({ email, name: `RDS ${papel}`, role: papel })
      .onConflictDoUpdate({ target: users.email, set: { role: papel, active: true } })
      .returning();
    for (const adAccountId of contas) {
      await db.insert(userAdAccounts).values({ userId: linha!.id, adAccountId }).onConflictDoNothing();
    }
    return { id: linha!.id, email, name: linha!.name, role: papel };
  } finally {
    await sql.end();
  }
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
        step: lote.etapa ?? ('upload_media' as const),
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
      if (lote.refs) {
        await db.insert(batchRefs).values([
          { batchId, refKey: 'c1', kind: 'campaign', state: lote.refs.campanha, metaId: lote.refs.campanha === 'created' ? '120001' : null },
          { batchId, refKey: 'a1', kind: 'adset', state: lote.refs.conjunto, metaId: lote.refs.conjunto === 'created' ? '120002' : null },
        ]);
      }
      ids.push(batchId);
    }
  } finally {
    await sql.end();
  }
  return ids;
}
