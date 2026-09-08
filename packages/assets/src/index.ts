import { sha256Hex } from '@adpub/crypto';
import {
  audit,
  getClient,
  listAssets,
  upsertAsset,
  type AssetRow,
  type Database,
} from '@adpub/db';
import { kindForMime, makeThumbnail, mimeForFilename, probe } from '@adpub/media';
import { validateMedia } from '@adpub/rules';
import type { AssetKind } from '@adpub/shared';
import { assetKey, thumbnailKey, type Storage } from '@adpub/storage';

export interface IncomingFile {
  filename: string;
  bytes: Uint8Array;
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

  const mime = input.file.mime ?? mimeForFilename(input.file.filename);
  const kind: AssetKind | null = kindForMime(mime);
  if (!kind) {
    throw new IngestError(
      `Arquivo ${input.file.filename} não é imagem nem vídeo (${mime}).`,
      'unsupported_type',
    );
  }

  const sha256 = sha256Hex(Buffer.from(input.file.bytes));
  const probed = await probeSafely(input.file, mime, kind);
  const validation = validateMedia({
    kind,
    mime,
    width: probed.width,
    height: probed.height,
    durationMs: probed.durationMs,
    sizeBytes: input.file.bytes.byteLength,
    filename: input.file.filename,
  });

  const storageKey = assetKey(input.clientId, sha256, input.file.filename);
  await deps.storage.put(storageKey, input.file.bytes, mime);

  let thumbKey: string | null = null;
  if (validation.status === 'ok') {
    const thumb = await makeThumbnail(input.file.bytes, kind, input.file.filename);
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
    sizeBytes: input.file.bytes.byteLength,
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
    return await probe(file.bytes, file.filename, mime);
  } catch {
    return { kind, width: 0, height: 0, durationMs: null, mime };
  }
}

export interface AssetWithThumb {
  asset: AssetRow;
  thumbnailUrl?: string;
}

export async function listClientAssets(
  deps: IngestDeps,
  filter: { clientId: string; kind?: AssetKind; status?: 'ok' | 'rejected' },
): Promise<AssetWithThumb[]> {
  const rows = await listAssets(deps.db, filter);
  return Promise.all(
    rows.map(async (asset) => {
      if (!asset.thumbnailKey) return { asset };
      try {
        return { asset, thumbnailUrl: await deps.storage.presignGet(asset.thumbnailKey) };
      } catch {
        return { asset };
      }
    }),
  );
}
