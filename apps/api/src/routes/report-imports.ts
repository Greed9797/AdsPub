import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../plugins/auth.js';import { badRequest } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { requireFeature } from '../lib/features.js';
import { commitReport, remapReport, uploadReport } from '../services/report-imports.js';

const contextSchema = z.object({
  currency: z.string().min(1),
  timezone: z.string().min(1),
  entity_level: z.enum(['account', 'campaign', 'adset', 'ad']),
  attribution: z.string().min(1),
  coverage: z.enum(['all', 'selected', 'unknown']),
});

/** T-003-2: upload → prévia → confirmação. Arquivo malformado falha com motivo. */
export function reportImportRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.post('/report-imports', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    requireFeature(deps, 'featureReports');
    if (!request.isMultipart()) throw badRequest('Envie multipart/form-data com arquivo e contexto.');
    let clientId: string | undefined;
    let adAccountId: string | undefined;
    let contextRaw: unknown;
    let sheet: string | undefined;
    let file: { filename: string; mime: string; bytes: Uint8Array } | undefined;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        file = {
          filename: part.filename,
          mime: part.mimetype || 'text/csv',
          bytes: new Uint8Array(await part.toBuffer()),
        };
      } else if (part.fieldname === 'client_id') clientId = String(part.value);
      else if (part.fieldname === 'ad_account_id') adAccountId = String(part.value);
      else if (part.fieldname === 'context') contextRaw = part.value;
      else if (part.fieldname === 'sheet') sheet = String(part.value);
    }
    if (!clientId) throw badRequest('client_id é obrigatório.');
    if (!file) throw badRequest('Arquivo CSV ou XLSX é obrigatório.');
    if (contextRaw === undefined) throw badRequest('context (JSON) é obrigatório.');
    // @fastify/multipart já parseia campo application/json: string ou objeto.
    const contextValue: unknown =
      typeof contextRaw === 'string' ? (JSON.parse(contextRaw) as unknown) : contextRaw;
    const parsed = z
      .object({
        client_id: z.string().uuid(),
        ad_account_id: z.string().min(1).optional(),
        context: contextSchema,
      })
      .parse({
        client_id: clientId,
        ...(adAccountId ? { ad_account_id: adAccountId } : {}),
        context: contextValue,
      });
    const preview = await uploadReport(deps, user, {
      clientId: parsed.client_id,
      adAccountId: parsed.ad_account_id ?? null,
      filename: file.filename,
      mime: file.mime,
      bytes: file.bytes,
      context: {
        currency: parsed.context.currency,
        timezone: parsed.context.timezone,
        entityLevel: parsed.context.entity_level,
        attribution: parsed.context.attribution,
        coverage: parsed.context.coverage,
      },
      ...(sheet ? { sheet } : {}),
    });
    return reply.status(201).send(preview);
  });

  app.patch('/report-imports/:id/mapping', async (request) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ mapping: z.record(z.string(), z.string().nullable()) })
      .strict()
      .parse(request.body);
    return remapReport(deps, user, id, body.mapping);
  });

  app.post('/report-imports/:id/commit', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await commitReport(deps, user, id);
    return reply.status(202).send(result);
  });
}
