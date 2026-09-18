import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  audit,
  getAccount,
  getOrCreateVariant,
  listVariants,
  openBinding,
} from '@adpub/db';
import { adFormatSchema, variantManifestSchema } from '@adpub/shared';
import { currentUser, requireRole } from '../plugins/auth.js';
import { notFound, unprocessable } from '../lib/problem.js';
import { assertAccountAccess, assertClientAccess } from '../lib/scope.js';
import type { ApiDeps } from '../lib/deps.js';

/** T-002-3: biblioteca de variantes + vínculo manual para histórico. */
export function variantRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/variants', async (request) => {
    const user = currentUser(request);
    const query = z
      .object({
        client_id: z.string().uuid(),
        format: adFormatSchema.optional(),
        q: z.string().max(200).optional(),
      })
      .parse(request.query);
    await assertClientAccess(deps, user, query.client_id);
    const rows = await listVariants(deps.db, {
      clientId: query.client_id,
      ...(query.format ? { format: query.format } : {}),
      ...(query.q ? { q: query.q } : {}),
    });
    return rows.map((row) => ({
      id: row.id,
      client_id: row.clientId,
      fingerprint: row.fingerprint,
      manifest: row.manifest,
      created_at: row.createdAt?.toISOString() ?? null,
    }));
  });

  app.post('/ad-accounts/:id/bindings', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await assertAccountAccess(deps, user, id);
    const account = await getAccount(deps.db, id);
    if (!account) throw notFound(`Conta ${id} não encontrada.`);
    const body = z
      .object({
        meta_ad_id: z.string().min(1).optional(),
        meta_creative_id: z.string().min(1).optional(),
        manifest: variantManifestSchema,
      })
      .strict()
      .parse(request.body);
    if (!account.clientId) throw unprocessable(`Conta ${id} sem cliente vinculado.`);
    // Manifesto fora do app vira variante do cliente — nunca associa por nome.
    const variant = await getOrCreateVariant(deps.db, account.clientId, body.manifest);
    const binding = await openBinding(deps.db, {
      adAccountId: id,
      ...(body.meta_ad_id ? { metaAdId: body.meta_ad_id } : {}),
      ...(body.meta_creative_id ? { metaCreativeId: body.meta_creative_id } : {}),
      variantId: variant.id,
      precision: 'manual',
    });
    await audit(deps.db, {
      actor: { id: user.id, email: user.email },
      action: 'variant.bind_manual',
      entityType: 'ad_creative_binding',
      entityId: binding.id,
      after: {
        ad_account_id: id,
        meta_ad_id: body.meta_ad_id ?? null,
        variant_id: variant.id,
      },
    });
    return reply.status(201).send({ id: binding.id, variant_id: variant.id, precision: binding.precision });
  });
}
