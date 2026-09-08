import {
  IngestError,
  ingestFile,
  listClientAssets as listAssetsWithThumbs,
  type AssetWithThumb,
  type IncomingFile,
  type IngestedAsset,
} from '@adpub/assets';
import type { AssetKind, SessionUser } from '@adpub/shared';
import { badRequest, notFound } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

export type { IncomingFile };

export async function uploadAssets(
  deps: ApiDeps,
  actor: SessionUser,
  input: { clientId: string; files: IncomingFile[] },
): Promise<IngestedAsset[]> {
  if (input.files.length === 0) throw badRequest('Nenhum arquivo enviado.');
  const out: IngestedAsset[] = [];
  for (const file of input.files) {
    try {
      out.push(
        await ingestFile(
          { db: deps.db, storage: deps.storage },
          {
            clientId: input.clientId,
            file,
            source: 'upload',
            actor: { id: actor.id, email: actor.email },
          },
        ),
      );
    } catch (error) {
      if (error instanceof IngestError) {
        throw error.code === 'client_not_found' ? notFound(error.message) : badRequest(error.message);
      }
      throw error;
    }
  }
  return out;
}

export async function listClientAssets(
  deps: ApiDeps,
  filter: { clientId: string; kind?: AssetKind; status?: 'ok' | 'rejected' },
): Promise<AssetWithThumb[]> {
  return listAssetsWithThumbs({ db: deps.db, storage: deps.storage }, filter);
}
