import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  audit,
  getAccount,
  listAdsetsCache,
  listCampaignsCache,
  listVisibleAccounts,
  updateAccountDefaults,
} from '@adpub/db';
import { adAccountDefaultsSchema } from '@adpub/shared';
import { currentUser, requireRole } from '../plugins/auth.js';
import { accountDto } from '../lib/dto.js';
import { notFound } from '../lib/problem.js';
import { assertAccountAccess } from '../lib/scope.js';
import { accountsHealth } from '../services/health.js';
import type { ApiDeps } from '../lib/deps.js';

const patchBody = adAccountDefaultsSchema;

export function accountRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/ad-accounts', async (request) => {
    const user = currentUser(request);
    const query = z.object({ client_id: z.string().uuid().optional() }).parse(request.query);
    const rows = await listVisibleAccounts(
      deps.db,
      { userId: user.id, role: user.role },
      query.client_id ? { clientId: query.client_id } : {},
    );
    return rows.map(accountDto);
  });

  app.get('/ad-accounts/:id', async (request) => {
    const user = currentUser(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await assertAccountAccess(deps, user, id);
    const row = await getAccount(deps.db, id);
    if (!row) throw notFound(`Conta ${id} não encontrada.`);
    return accountDto(row);
  });

  app.patch('/ad-accounts/:id', async (request) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await assertAccountAccess(deps, user, id);
    const body = patchBody.parse(request.body);
    const before = await getAccount(deps.db, id);
    if (!before) throw notFound(`Conta ${id} não encontrada.`);

    const updated = await updateAccountDefaults(deps.db, id, body);
    if (!updated) throw notFound(`Conta ${id} não encontrada.`);

    await audit(deps.db, {
      actor: { id: user.id, email: user.email },
      action: 'account.update_defaults',
      entityType: 'ad_account',
      entityId: id,
      before: {
        default_page_id: before.defaultPageId,
        default_ig_user_id: before.defaultIgUserId,
        default_pixel_id: before.defaultPixelId,
        daily_ad_cap: before.dailyAdCap,
      },
      after: body,
    });
    return accountDto(updated);
  });

  app.get('/ad-accounts/:id/campaigns', async (request) => {
    const user = currentUser(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await assertAccountAccess(deps, user, id);
    const rows = await listCampaignsCache(deps.db, id);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      objective: row.objective,
      status: row.status,
      effective_status: row.effectiveStatus,
      special_ad_categories: row.raw.special_ad_categories ?? [],
    }));
  });

  app.get('/ad-accounts/:id/adsets', async (request) => {
    const user = currentUser(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = z.object({ campaign_id: z.string().optional() }).parse(request.query);
    await assertAccountAccess(deps, user, id);
    const rows = await listAdsetsCache(deps.db, id, query.campaign_id);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      campaign_id: row.campaignId,
      status: row.status,
      effective_status: row.effectiveStatus,
      optimization_goal: row.optimizationGoal,
      billing_event: row.raw.billing_event ?? null,
      destination_type: row.raw.destination_type ?? null,
      promoted_object: row.raw.promoted_object ?? null,
    }));
  });

  app.get('/ad-accounts/:id/health', async (request) => {
    const user = currentUser(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await assertAccountAccess(deps, user, id);
    const [health] = await accountsHealth(deps, [id]);
    if (!health) throw notFound(`Conta ${id} não encontrada.`);
    return health;
  });

  app.get('/health/accounts', async (request) => {
    const user = currentUser(request);
    const rows = await listVisibleAccounts(deps.db, { userId: user.id, role: user.role });
    return accountsHealth(
      deps,
      rows.map((row) => row.id),
    );
  });
}
