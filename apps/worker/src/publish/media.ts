import { VIDEO_POLL_INTERVAL_MS, VIDEO_READY_TIMEOUT_MS } from '@adpub/config';
import { getAssetUpload, saveAssetUpload, type AssetRow } from '@adpub/db';
import { getVideoStatus, uploadImage, uploadVideoFromSource } from '@adpub/meta-client/write';
import { makeImageThumbnail } from '@adpub/media';
import type { MetaClient } from '@adpub/meta-client';
import type { WorkerContext } from '../context.js';

export class VideoNotReadyError extends Error {
  constructor(
    readonly videoId: string,
    readonly progress: number,
  ) {
    super(`Vídeo ${videoId} ainda processando na Meta (${progress}%).`);
    this.name = 'VideoNotReadyError';
  }
}

/**
 * R7: a mídia é enviada uma vez por (asset, conta) e o hash/id fica em
 * `asset_uploads`. Reprocessar um item nunca reenvia bytes.
 */
export async function ensureImageHash(
  ctx: WorkerContext,
  client: MetaClient,
  input: { asset: AssetRow; adAccountId: string },
): Promise<string> {
  const cached = await getAssetUpload(ctx.db, input.asset.id, input.adAccountId);
  if (cached?.metaImageHash) return cached.metaImageHash;

  const bytes = await ctx.storage.get(input.asset.storageKey);
  const hash = await uploadImage(client, input.adAccountId, {
    filename: input.asset.filename,
    bytes,
    mime: input.asset.mime,
  });
  await saveAssetUpload(ctx.db, {
    assetId: input.asset.id,
    adAccountId: input.adAccountId,
    metaImageHash: hash,
  });
  return hash;
}

export interface VideoUploadResult {
  videoId: string;
  thumbnailHash?: string;
}

/**
 * R8: upload retomável + `UPLOADING_MEDIA` não bloqueante. Se o vídeo ainda
 * está sendo processado, lança `VideoNotReadyError` para o job ser reagendado.
 */
export async function ensureVideoReady(
  ctx: WorkerContext,
  client: MetaClient,
  input: { asset: AssetRow; adAccountId: string; startedAt?: Date },
): Promise<VideoUploadResult> {
  const cached = await getAssetUpload(ctx.db, input.asset.id, input.adAccountId);
  let videoId = cached?.metaVideoId ?? undefined;
  let thumbnailHash = cached?.thumbnailHash ?? undefined;

  if (!videoId) {
    // Lê por faixa: o vídeo fica no storage; só o pedaço atual passa pela memória.
    videoId = await uploadVideoFromSource(client, input.adAccountId, {
      filename: input.asset.filename,
      sizeBytes: Number(input.asset.sizeBytes),
      readRange: (start, end) => ctx.storage.getRange(input.asset.storageKey, start, end),
    });
    await saveAssetUpload(ctx.db, {
      assetId: input.asset.id,
      adAccountId: input.adAccountId,
      metaVideoId: videoId,
      videoStatus: 'processing',
    });
  }

  if (cached?.videoStatus !== 'ready') {
    const status = await getVideoStatus(client, videoId);
    const state = status.status?.video_status ?? 'processing';
    if (state !== 'ready') {
      const startedAt = input.startedAt ?? new Date();
      if (Date.now() - startedAt.getTime() > VIDEO_READY_TIMEOUT_MS) {
        throw new Error(
          `Vídeo ${videoId} não ficou pronto em ${Math.round(VIDEO_READY_TIMEOUT_MS / 60_000)} min.`,
        );
      }
      throw new VideoNotReadyError(videoId, status.status?.processing_progress ?? 0);
    }
    await saveAssetUpload(ctx.db, {
      assetId: input.asset.id,
      adAccountId: input.adAccountId,
      metaVideoId: videoId,
      videoStatus: 'ready',
      ...(thumbnailHash ? { thumbnailHash } : {}),
    });
  }

  if (!thumbnailHash && input.asset.thumbnailKey) {
    thumbnailHash = await uploadThumbnail(ctx, client, input);
  }

  return { videoId, ...(thumbnailHash ? { thumbnailHash } : {}) };
}

async function uploadThumbnail(
  ctx: WorkerContext,
  client: MetaClient,
  input: { asset: AssetRow; adAccountId: string },
): Promise<string | undefined> {
  if (!input.asset.thumbnailKey) return undefined;
  try {
    const thumbBytes = await ctx.storage.get(input.asset.thumbnailKey);
    const normalized = await makeImageThumbnail(thumbBytes, 1080);
    const hash = await uploadImage(client, input.adAccountId, {
      filename: `${input.asset.sha256}.jpg`,
      bytes: normalized,
      mime: 'image/jpeg',
    });
    await saveAssetUpload(ctx.db, {
      assetId: input.asset.id,
      adAccountId: input.adAccountId,
      thumbnailHash: hash,
    });
    return hash;
  } catch (error) {
    ctx.log.warn({ err: error, asset: input.asset.id }, 'thumbnail do vídeo não enviada');
    return undefined;
  }
}

export const VIDEO_RETRY_DELAY_MS = VIDEO_POLL_INTERVAL_MS;
