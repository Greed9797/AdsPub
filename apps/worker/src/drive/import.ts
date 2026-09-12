import { IngestError, ingestFile } from '@adpub/assets';
import { audit } from '@adpub/db';
import { google } from 'googleapis';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { WorkerContext } from '../context.js';

export interface DriveImportJobData {
  clientId: string;
  folderUrl: string;
  recursive: boolean;
  actorId: string | null;
}

export interface DriveImportResult {
  imported: number;
  reused: number;
  rejected: Array<{ filename: string; reason: string }>;
}

const MAX_FILE_BYTES = 500 * 1024 * 1024;

/** R15: leitura de pastas compartilhadas com a conta de serviço do Workspace. */
export function folderIdFromUrl(url: string): string {
  const patterns = [/\/folders\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match?.[1]) return match[1];
  }
  if (/^[a-zA-Z0-9_-]{10,}$/.test(url.trim())) return url.trim();
  throw new Error(`Não reconheci uma pasta do Drive em "${url}".`);
}

function driveClient(serviceAccountJson: string) {
  const credentials = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
  };
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

export async function runDriveImport(
  ctx: WorkerContext,
  data: DriveImportJobData,
): Promise<DriveImportResult> {
  if (!ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurado — importação do Drive indisponível.');
  }
  const drive = driveClient(ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const rootId = folderIdFromUrl(data.folderUrl);

  const result: DriveImportResult = { imported: 0, reused: 0, rejected: [] };
  const queue: string[] = [rootId];
  const seenFolders = new Set<string>();

  while (queue.length > 0) {
    const folderId = queue.shift();
    if (!folderId || seenFolders.has(folderId)) continue;
    seenFolders.add(folderId);

    let pageToken: string | undefined;
    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: 200,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(pageToken ? { pageToken } : {}),
      });

      for (const file of response.data.files ?? []) {
        if (!file.id || !file.name) continue;
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          if (data.recursive) queue.push(file.id);
          continue;
        }
        if (Number(file.size ?? 0) > MAX_FILE_BYTES) {
          result.rejected.push({ filename: file.name, reason: 'arquivo acima de 500 MB' });
          continue;
        }

        try {
          // Baixa em streaming para um temporário: vídeo do Drive não passa pela memória.
          const download = await drive.files.get(
            { fileId: file.id, alt: 'media', supportsAllDrives: true },
            { responseType: 'stream' },
          );
          const dir = await mkdtemp(join(tmpdir(), 'adpub-drive-'));
          const path = join(dir, 'download');
          try {
            await pipeline(download.data as NodeJS.ReadableStream, createWriteStream(path));
            const { size } = await stat(path);
            const ingested = await ingestFile(
              { db: ctx.db, storage: ctx.storage },
              {
                clientId: data.clientId,
                file: {
                  filename: file.name,
                  path,
                  sizeBytes: size,
                  ...(file.mimeType ? { mime: file.mimeType } : {}),
                },
                source: 'drive',
                driveFileId: file.id,
                actor: { id: data.actorId },
              },
            );
            if (ingested.reused) result.reused += 1;
            else result.imported += 1;
            if (ingested.asset.validation.status === 'rejected') {
              result.rejected.push({
                filename: file.name,
                reason: ingested.asset.validation.errors[0] ?? 'reprovado na validação de mídia',
              });
            }
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        } catch (error) {
          result.rejected.push({
            filename: file.name,
            reason:
              error instanceof IngestError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : String(error),
          });
        }
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  await audit(ctx.db, {
    actor: { id: data.actorId },
    action: 'asset.import_drive',
    entityType: 'client',
    entityId: data.clientId,
    after: {
      folder: data.folderUrl,
      imported: result.imported,
      reused: result.reused,
      rejected: result.rejected.length,
    },
  });

  ctx.log.info({ client: data.clientId, ...result }, 'importação do Drive concluída');
  return result;
}
