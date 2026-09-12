import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256File } from '@adpub/crypto';
import {
  audit,
  getClient,
  listAssets,
  upsertAsset,
  type AssetRow,
  type Database,
} from '@adpub/db';
import { kindForMime, makeThumbnailFile, mimeForFilename, probeFile } from '@adpub/media';
import { validateMedia } from '@adpub/rules';
import type { AssetKind } from '@adpub/shared';
import { assetKey, thumbnailKey, type Storage } from '@adpub/storage';

/**
 * Arquivo já materializado em disco: quem recebe o upload (API ou importação
 * do Drive) grava num temporário e passa o caminho — vídeo não passa pela
 * memória. O chamador apaga o arquivo depois.
 */
export interface IncomingFile {
  filename: string;
  path: string;
  sizeBytes: number;
  mime?: string;
}

export interface IngestActor {
  id?: string | null;
  email?: string | null;
}

export interface IngestInput {
  clientId: string;
  file: IncomingFile;
  source: 'upload' | 'drive';
  driveFileId?: string | null;
  actor?: IngestActor | null;
}

export interface IngestedAsset {
  asset: AssetRow;
  reused: boolean;
}

export class IngestError extends Error {
  constructor(
    message: string,
    readonly code: 'client_not_found' | 'unsupported_type',
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

/**
 * Grava os bytes num temporário e devolve o `IncomingFile` (fixtures, scripts
 * e smokes). Quem chama apaga o temporário com o `cleanup`.
 */
export async function tempFileFromBytes(file: {
  filename: string;
  bytes: Uint8Array;
  mime?: string;
}): Promise<{ file: IncomingFile; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'adpub-file-'));
  const path = join(dir, file.filename.replace(/[^\w.-]/g, '_') || 'file');
  await writeFile(path, file.bytes);
  return {
    file: {
      filename: file.filename,
      path,
      sizeBytes: file.bytes.byteLength,
      ...(file.mime ? { mime: file.mime } : {}),
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export interface IngestDeps {
  db: Database;
  storage: Storage;
}

/**
 * FR-004: pipeline único de ingestão — probe → specs → dedupe por sha256 →
 * storage → registro + auditoria. Compartilhado por upload direto (API) e
 * importação do Drive (worker) para que as duas portas validem igual.
 */
export async function ingestFile(
  deps: IngestDeps,
  input: IngestInput,
): Promise<IngestedAsset> {
  const client = await getClient(deps.db, input.clientId);
  if (!client) {
    throw new IngestError(`Cliente ${input.clientId} não encontrado.`, 'client_not_found');
  }

  const mime = pickMime(input.file.mime, input.file.filename);
  const kind: AssetKind | null = kindForMime(mime);
  if (!kind) {
    throw new IngestError(
      `Arquivo ${input.file.filename} não é imagem nem vídeo (${mime}).`,
      'unsupported_type',
    );
  }

  const sha256 = await sha256File(input.file.path);
  const probed = await probeSafely(input.file, mime, kind);
  const validation = validateMedia({
    kind,
    mime,
    width: probed.width,
    height: probed.height,
    durationMs: probed.durationMs,
    sizeBytes: input.file.sizeBytes,
    filename: input.file.filename,
    ...(probed.videoCodec ? { videoCodec: probed.videoCodec } : {}),
    ...(probed.audioCodec ? { audioCodec: probed.audioCodec } : {}),
    ...(probed.frameRate !== undefined ? { frameRate: probed.frameRate } : {}),
  });

  const storageKey = assetKey(input.clientId, sha256, input.file.filename);
  await deps.storage.putFile(storageKey, input.file.path, mime);

  let thumbKey: string | null = null;
  if (validation.status === 'ok') {
    // Frame do meio do vídeo curto, do primeiro segundo quando há folga.
    const atSeconds = probed.durationMs ? Math.min(1, probed.durationMs / 2000) : undefined;
    const thumb = await makeThumbnailFile(input.file.path, kind, atSeconds);
    if (thumb) {
      thumbKey = thumbnailKey(input.clientId, sha256);
      await deps.storage.put(thumbKey, thumb, 'image/jpeg');
    }
  }

  const { asset, reused } = await upsertAsset(deps.db, {
    clientId: input.clientId,
    sha256,
    kind,
    storageKey,
    filename: input.file.filename,
    mime,
    width: probed.width,
    height: probed.height,
    aspectRatio: validation.aspect_ratio,
    durationMs: probed.durationMs,
    sizeBytes: input.file.sizeBytes,
    source: input.source,
    driveFileId: input.driveFileId ?? null,
    validation: {
      status: validation.status,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    thumbnailKey: thumbKey,
  });

  if (!reused) {
    await audit(deps.db, {
      actor: input.actor ?? null,
      action: 'asset.create',
      entityType: 'asset',
      entityId: asset.id,
      after: {
        filename: asset.filename,
        sha256,
        source: input.source,
        validation: asset.validation,
      },
    });
  }

  return { asset, reused };
}

async function probeSafely(file: IncomingFile, mime: string, kind: AssetKind) {
  try {
    return await probeFile(file.path, file.filename, mime);
  } catch {
    return { kind, width: 0, height: 0, durationMs: null, mime };
  }
}

/**
 * Cliente que manda `application/octet-stream` (curl, scripts, alguns uploads
 * de app) ainda traz a extensão no nome: ela decide o tipo, e o probe confere
 * o conteúdo de verdade em seguida.
 */
function pickMime(mime: string | undefined, filename: string): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  return mimeForFilename(filename);
}

export interface AssetWithThumb {
  asset: AssetRow;
  thumbnailUrl?: string;
  /** Link assinado do arquivo original (o player de vídeo usa este). */
  url?: string;
}

export async function listClientAssets(
  deps: IngestDeps,
  filter: { clientId: string; kind?: AssetKind; status?: 'ok' | 'rejected' },
): Promise<AssetWithThumb[]> {
  const rows = await listAssets(deps.db, filter);
  return Promise.all(
    rows.map(async (asset) => {
      const [thumbnailUrl, url] = await Promise.all([
        asset.thumbnailKey ? presign(deps.storage, asset.thumbnailKey) : undefined,
        asset.storageKey ? presign(deps.storage, asset.storageKey) : undefined,
      ]);
      return {
        asset,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(url ? { url } : {}),
      };
    }),
  );
}

async function presign(storage: Storage, key: string): Promise<string | undefined> {
  try {
    return await storage.presignGet(key);
  } catch {
    return undefined;
  }
}
