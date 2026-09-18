import type { FastifyInstance } from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { MAX_UPLOAD_BYTES, QUEUES } from '@adpub/config';
import {
  DRIVE_STUCK_MS,
  DriveImportOpenError,
  createDriveImportJob,
  driveImportJobTimings,
  findActiveDriveImportJob,
  findLatestDriveImportJob,
  getDriveImportJob,
  requeueDriveImportJob,
  type DriveImportJobRow,
} from '@adpub/db';
import { currentUser, requireRole } from '../plugins/auth.js';
import { assetDto } from '../lib/dto.js';
import { badRequest, notFound } from '../lib/problem.js';
import { assertClientAccess } from '../lib/scope.js';
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
    const user = currentUser(request);
    const query = listQuery.parse(request.query);
    await assertClientAccess(deps, user, query.client_id);
    const rows = await listClientAssets(deps, {
      clientId: query.client_id,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    return rows.map((row) => assetDto(row.asset, row.thumbnailUrl, row.url));
  });

  app.post('/assets', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
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
      await assertClientAccess(deps, user, parsedClientId);
      const created = await uploadAssets(deps, user, { clientId: parsedClientId, files });
      return reply.status(201).send(created.map(({ asset }) => assetDto(asset)));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  /**
   * A linha do job nasce aqui (`queued`) e o worker marca o resto: a tela
   * acompanha em `GET /drive-import-jobs/:id` sem depender do Redis. Pastas
   * iguais ainda na fila não abrem segundo job.
   */
  app.post('/assets/import-drive', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator', 'manager']);
    const body = importBody.parse(request.body);
    await assertClientAccess(deps, user, body.client_id);
    const active = await findActiveDriveImportJob(deps.db, {
      clientId: body.client_id,
      folderUrl: body.folder_url,
    });
    if (active) {
      // `running` com batida antiga é órfão (worker morreu após o claim): o
      // índice parcial barra novo insert, então este POST devolve o próprio job
      // para `queued` e reenfileira — o worker reivindica e executa de verdade.
      // (Só `claim` aqui renovaria a batida e o worker voltaria sem rodar.)
      if (active.status === 'running' && active.updatedAt.getTime() < Date.now() - DRIVE_STUCK_MS) {
        const retomado = await requeueDriveImportJob(deps.db, active.id);
        if (retomado) {
          const queued = await deps.queues.enqueueImportDrive({
            jobId: retomado.id,
            clientId: body.client_id,
            folderUrl: body.folder_url,
            recursive: retomado.recursive,
            actorId: user.id,
          });
          return reply.status(202).send({
            ...driveImportJobDto(retomado),
            queue: queued.queue,
            queue_job_id: queued.job_id,
          });
        }
      }
      return reply
        .status(202)
        .send({ ...driveImportJobDto(active), queue: QUEUES.driveImport, queue_job_id: null });
    }
    let row;
    try {
      row = await createDriveImportJob(deps.db, {
        clientId: body.client_id,
        folderUrl: body.folder_url,
        recursive: body.recursive,
        requestedBy: user.id,
      });
    } catch (error) {
      // Corrida entre o `findActive` e o insert: o outro pedido venceu e o
      // índice parcial barrou este — volta ao job vivo, sem duplicar.
      if (error instanceof DriveImportOpenError)
        return reply
          .status(202)
          .send({ ...driveImportJobDto(error.job), queue: QUEUES.driveImport, queue_job_id: null });
      throw error;
    }
    const queued = await deps.queues.enqueueImportDrive({
      jobId: row.id,
      clientId: body.client_id,
      folderUrl: body.folder_url,
      recursive: body.recursive,
      actorId: user.id,
    });
    return reply
      .status(202)
      .send({ ...driveImportJobDto(row), queue: queued.queue, queue_job_id: queued.job_id });
  });

  app.get('/drive-import-jobs/:id', async (request) => {
    currentUser(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await getDriveImportJob(deps.db, id);
    if (!job) throw notFound(`Importação ${id} não encontrada.`);
    return { ...driveImportJobDto(job), ...driveImportJobTimings(job) };
  });

  app.get('/clients/:id/drive-imports', async (request) => {
    const user = currentUser(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await assertClientAccess(deps, user, id);
    const job = await findLatestDriveImportJob(deps.db, id);
    if (!job) return { job: null };
    return { job: { ...driveImportJobDto(job), ...driveImportJobTimings(job) } };
  });
}

function driveImportJobDto(row: DriveImportJobRow) {
  return {
    job_id: row.id,
    client_id: row.clientId,
    folder_url: row.folderUrl,
    recursive: row.recursive,
    status: row.status,
    imported: row.imported,
    reused: row.reused,
    rejected: row.rejected,
    error: row.error,
    queued_at: row.queuedAt.toISOString(),
    started_at: row.startedAt?.toISOString() ?? null,
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}
