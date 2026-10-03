/**
 * Semeia lotes com anúncios em estados variados direto no banco do e2e. O fluxo
 * real leva minutos por lote; a lista só precisa ler o que a API devolve, então
 * a semente escreve as linhas que o worker e a revisão escreveriam.
 */
import { randomUUID } from 'node:crypto';

import { adDrafts, assets, batchRefs, batches, clients, createDb, userAdAccounts, users } from '@adpub/db';
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
  /** Anúncios apontam para campanha e conjunto que já existem na Meta (salvar um item não exige plano). */
  refsExistentes?: boolean;
  /** Conta do lote: a principal (padrão) ou a de revisão. */
  conta?: 'principal' | 'revisao';
  /** Marca os anúncios como publicados hoje, o que consome o saldo diário da conta. */
  publicadoHoje?: boolean;
  /** Grava um erro de validação (link ausente) em cada anúncio. */
  comErro?: boolean;
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
        campaignRef: lote.refsExistentes ? { kind: 'existing' as const, id: '23850000000000101' } : { kind: 'new' as const, key: 'c1' },
        adsetRef: lote.refsExistentes ? { kind: 'existing' as const, id: '23850000000000202' } : { kind: 'new' as const, key: 'a1' },
        format: 'single_image' as const,
        assetIds: [seed.asset.id],
        copy: { primary_text: 'Texto', headline: '', description: '', cta: 'SHOP_NOW' as const, link: '', display_link: '', url_tags: '' },
        name: `${lote.nome} · ${position + 1}`,
        pageId: seed.account.pageId,
        status,
        publishedAt: lote.publicadoHoje ? new Date() : null,
        step: lote.etapa ?? ('upload_media' as const),
        validation: lote.comErro
          ? {
              status: 'blocked' as const,
              errors: [{ code: 'link_missing', field: 'copy.link', message: 'Link de destino ausente', fix: 'Cole o link da página de destino.' }],
              warnings: [],
              policy: [],
            }
          : null,
        metaIds: { image_hashes: {}, video_ids: {}, thumbnail_hashes: {} },
        idempotencyKey: `${batchId}:${position}`,
      }));
      const fingerprint = lote.aprovado
        ? approvalFingerprint(itens.map((item) => ({ ...item, igUserId: null })))
        : null;
      await db.insert(batches).values({
        id: batchId,
        clientId: seed.client.id,
        adAccountId: lote.conta === 'revisao' ? seed.reviewAccount.id : seed.account.id,
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

/**
 * Tira a senha de todos os usuários, que é o que liga o "Primeiro acesso" (a API
 * só o oferece enquanto ninguém tem senha). Devolve a função que restaura os hashes.
 */
export async function desligarSenhas(): Promise<() => Promise<void>> {
  const { sql } = createDb(`${POSTGRES_BASE_URL}/${E2E_DATABASE}`, { max: 1, onNotice: () => {} });
  const guardados = await sql<{ id: string; password_hash: string }[]>`select id, password_hash from users where password_hash is not null`;
  await sql`update users set password_hash = null`;
  await sql.end();
  return async () => {
    const { sql: volta } = createDb(`${POSTGRES_BASE_URL}/${E2E_DATABASE}`, { max: 1, onNotice: () => {} });
    for (const linha of guardados) {
      await volta`update users set password_hash = ${linha.password_hash} where id = ${linha.id}`;
    }
    await volta.end();
  };
}

export interface MidiaSemeada {
  filename: string;
  kind: 'image' | 'video';
  status: 'ok' | 'rejected';
  warnings?: string[];
  errors?: string[];
}

/** Cria um cliente só da spec, com a biblioteca pedida, para não mexer na do seed. */
export async function semearBiblioteca(nome: string, midias: readonly MidiaSemeada[]): Promise<{ clientId: string }> {
  const { db, sql } = createDb(`${POSTGRES_BASE_URL}/${E2E_DATABASE}`, { max: 1, onNotice: () => {} });
  try {
    const [cliente] = await db
      .insert(clients)
      .values({ name: nome, voiceProfile: { tone: '', audience: '', forbidden_terms: [], allowed_claims: [], examples: [] } })
      .returning();
    for (const [i, midia] of midias.entries()) {
      await db.insert(assets).values({
        clientId: cliente!.id,
        sha256: `rds13-${cliente!.id}-${i}`,
        kind: midia.kind,
        storageKey: `rds13/${i}`,
        filename: midia.filename,
        mime: midia.kind === 'image' ? 'image/jpeg' : 'video/mp4',
        width: 1080,
        height: 1080,
        aspectRatio: '1:1',
        durationMs: midia.kind === 'video' ? 15000 : null,
        sizeBytes: 400_000,
        source: 'upload',
        validation: { status: midia.status, errors: midia.errors ?? [], warnings: midia.warnings ?? [] },
      });
    }
    return { clientId: cliente!.id };
  } finally {
    await sql.end();
  }
}

/** Devolve o teto diário da conta ao valor do seed (a spec de contas o altera pela ficha). */
export async function definirTetoDaConta(contaId: string, teto: number): Promise<void> {
  const { sql } = createDb(`${POSTGRES_BASE_URL}/${E2E_DATABASE}`, { max: 1, onNotice: () => {} });
  try {
    await sql`update ad_accounts set daily_ad_cap = ${teto} where id = ${contaId}`;
  } finally {
    await sql.end();
  }
}
