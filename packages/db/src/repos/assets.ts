import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AssetKind, AssetSource } from '@adpub/shared';
import { assetUploads, assets } from '../schema.js';
import type { AssetRow, AssetUploadRow } from '../schema.js';
import type { Database } from '../client.js';

export interface AssetInsert {
  clientId: string;
  sha256: string;
  kind: AssetKind;
  storageKey: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  aspectRatio: string;
  durationMs?: number | null;
  sizeBytes: number;
  source: AssetSource;
  driveFileId?: string | null;
  validation: { status: 'ok' | 'rejected'; errors: string[]; warnings: string[] };
  thumbnailKey?: string | null;
}

/** FR-004: dedupe por SHA-256 dentro do cliente — reaproveita o registro. */
export async function upsertAsset(
  db: Database,
  input: AssetInsert,
): Promise<{ asset: AssetRow; reused: boolean }> {
  const existing = await findAssetByHash(db, input.clientId, input.sha256);
  if (existing) return { asset: existing, reused: true };

  const [row] = await db
    .insert(assets)
    .values({
      clientId: input.clientId,
      sha256: input.sha256,
      kind: input.kind,
      storageKey: input.storageKey,
      filename: input.filename,
      mime: input.mime,
      width: input.width,
      height: input.height,
      aspectRatio: input.aspectRatio,
      durationMs: input.durationMs ?? null,
      sizeBytes: input.sizeBytes,
      source: input.source,
      driveFileId: input.driveFileId ?? null,
      validation: input.validation,
      thumbnailKey: input.thumbnailKey ?? null,
    })
    .onConflictDoNothing({ target: [assets.clientId, assets.sha256] })
    .returning();

  if (row) return { asset: row, reused: false };
  const raced = await findAssetByHash(db, input.clientId, input.sha256);
  if (!raced) throw new Error('Falha ao inserir criativo.');
  return { asset: raced, reused: true };
}

export async function findAssetByHash(
  db: Database,
  clientId: string,
  sha256: string,
): Promise<AssetRow | undefined> {
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.clientId, clientId), eq(assets.sha256, sha256)));
  return row;
}

export async function listAssets(
  db: Database,
  filter: { clientId: string; kind?: AssetKind; status?: 'ok' | 'rejected' },
): Promise<AssetRow[]> {
  const filters = [eq(assets.clientId, filter.clientId)];
  if (filter.kind) filters.push(eq(assets.kind, filter.kind));
  if (filter.status) filters.push(sql`${assets.validation}->>'status' = ${filter.status}`);
  return db
    .select()
    .from(assets)
    .where(and(...filters))
    .orderBy(sql`${assets.createdAt} desc`);
}

export async function getAssetsByIds(db: Database, ids: readonly string[]): Promise<AssetRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(assets).where(inArray(assets.id, [...ids]));
}

/** FR-005: cache de image_hash/video_id por (asset, conta). */
export async function getAssetUpload(
  db: Database,
  assetId: string,
  adAccountId: string,
): Promise<AssetUploadRow | undefined> {
  const [row] = await db
    .select()
    .from(assetUploads)
    .where(and(eq(assetUploads.assetId, assetId), eq(assetUploads.adAccountId, adAccountId)));
  return row;
}

export async function saveAssetUpload(
  db: Database,
  input: {
    assetId: string;
    adAccountId: string;
    metaImageHash?: string | null;
    metaVideoId?: string | null;
    videoStatus?: string | null;
    thumbnailHash?: string | null;
  },
): Promise<AssetUploadRow> {
  const [row] = await db
    .insert(assetUploads)
    .values({
      assetId: input.assetId,
      adAccountId: input.adAccountId,
      metaImageHash: input.metaImageHash ?? null,
      metaVideoId: input.metaVideoId ?? null,
      videoStatus: input.videoStatus ?? null,
      thumbnailHash: input.thumbnailHash ?? null,
    })
    .onConflictDoUpdate({
      target: [assetUploads.assetId, assetUploads.adAccountId],
      set: {
        metaImageHash: sql`coalesce(excluded.meta_image_hash, ${assetUploads.metaImageHash})`,
        metaVideoId: sql`coalesce(excluded.meta_video_id, ${assetUploads.metaVideoId})`,
        videoStatus: sql`coalesce(excluded.video_status, ${assetUploads.videoStatus})`,
        thumbnailHash: sql`coalesce(excluded.thumbnail_hash, ${assetUploads.thumbnailHash})`,
        uploadedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error('Falha ao salvar upload do criativo.');
  return row;
}
