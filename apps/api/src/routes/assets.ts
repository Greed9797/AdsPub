import type { FastifyInstance } from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { MAX_UPLOAD_BYTES } from '@adpub/config';
import { currentUser } from '../plugins/auth.js';
import { assetDto } from '../lib/dto.js';
import { badRequest } from '../lib/problem.js';
import { listClientAssets, uploadAssets, type IncomingFile } from '../services/assets.js';
import type { ApiDeps } from '../lib/deps.js';

const listQuery = z.object({
  client_id: z.string().uuid(),
  kind: z.enum(['image', 'video']).optional(),
  status: z.enum(['ok', 'rejected']).optional(),
});

const importBody = z.object({
  client_id: z.string().uuid(),
  folder_url: z.string().min(5),
  recursive: z.boolean().default(true),
});

export function assetRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/assets', async (request) => {
    currentUser(request);
    const query = listQuery.parse(request.query);
    const rows = await listClientAssets(deps, {
      clientId: query.client_id,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    return rows.map((row) => assetDto(row.asset, row.thumbnailUrl, row.url));
  });

  app.post('/assets', async (request, reply) => {
    const user = currentUser(request);
    if (!request.isMultipart()) throw badRequest('Envie multipart/form-data com client_id e files.');

    let clientId: string | undefined;
    const files: IncomingFile[] = [];
    // Cada parte vai para um arquivo temporário: vídeo de 500 MB não pode
    // atravessar a ingestão na memória (probe, hash e upload são em streaming).
    const dir = await mkdtemp(join(tmpdir(), 'adpub-upload-'));
    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          const path = join(dir, `part-${files.length}`);
          await pipeline(part.file, createWriteStream(path));
          if (part.file.truncated) {
            throw badRequest(
              `Arquivo ${part.filename} passou do limite de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
            );
          }
          const { size } = await stat(path);
          files.push({
            filename: part.filename,
            path,
            sizeBytes: size,
            ...(part.mimetype ? { mime: part.mimetype } : {}),
          });
        } else if (part.fieldname === 'client_id') {
          clientId = String(part.value);
        }
      }

      if (!clientId) throw badRequest('client_id é obrigatório.');
      const parsedClientId = z.string().uuid().parse(clientId);
      const created = await uploadAssets(deps, user, { clientId: parsedClientId, files });
      return reply.status(201).send(created.map(({ asset }) => assetDto(asset)));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  app.post('/assets/import-drive', async (request, reply) => {
    const user = currentUser(request);
    const body = importBody.parse(request.body);
    const job = await deps.queues.enqueueImportDrive({
      clientId: body.client_id,
      folderUrl: body.folder_url,
      recursive: body.recursive,
      actorId: user.id,
    });
    return reply.status(202).send(job);
  });
}
