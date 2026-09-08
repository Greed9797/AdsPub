import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
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
    return rows.map((row) => assetDto(row.asset, row.thumbnailUrl));
  });

  app.post('/assets', async (request, reply) => {
    const user = currentUser(request);
    if (!request.isMultipart()) throw badRequest('Envie multipart/form-data com client_id e files.');

    let clientId: string | undefined;
    const files: IncomingFile[] = [];

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        files.push({
          filename: part.filename,
          bytes: new Uint8Array(await part.toBuffer()),
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
