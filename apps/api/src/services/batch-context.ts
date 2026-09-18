import {
  getAccount,
  getClient,
  getClientAssetsByIds,
  listAccountPageIds,
  listAdsetsCache,
  listCampaignsCache,
  type AdAccountRow,
  type AssetRow,
  type ClientRow,
} from '@adpub/db';
import type { ValidateContext } from '@adpub/rules';
import { notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

export interface BatchContext {
  account: AdAccountRow;
  client: ClientRow;
  eligiblePageIds: string[];
  campaigns: Array<{ id: string; name: string; objective?: string }>;
  adsets: Array<{ id: string; name: string; campaign_id?: string }>;
}

export async function loadBatchContext(
  deps: ApiDeps,
  input: { clientId: string; adAccountId: string },
): Promise<BatchContext> {
  const [account, client] = await Promise.all([
    getAccount(deps.db, input.adAccountId),
    getClient(deps.db, input.clientId),
  ]);
  if (!account) throw notFound(`Conta ${input.adAccountId} não encontrada.`);
  if (!client) throw notFound(`Cliente ${input.clientId} não encontrado.`);

  const [eligiblePageIds, campaigns, adsets] = await Promise.all([
    listAccountPageIds(deps.db, account.id),
    listCampaignsCache(deps.db, account.id),
    listAdsetsCache(deps.db, account.id),
  ]);

  return {
    account,
    client,
    eligiblePageIds,
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, objective: c.objective })),
    adsets: adsets.map((a) => ({
      id: a.id,
      name: a.name,
      ...(a.campaignId ? { campaign_id: a.campaignId } : {}),
    })),
  };
}

export function validateContextFrom(
  ctx: BatchContext,
  assets: AssetRow[],
  extra: { objective?: string; variant?: number; now?: Date } = {},
): ValidateContext {
  return {
    client: {
      name: ctx.client.name,
      landing_domains: ctx.client.landingDomains,
      naming_template: ctx.client.namingTemplate,
      default_utm: ctx.client.defaultUtm,
      policy_mode: ctx.client.policyMode,
      forbidden_terms: ctx.client.voiceProfile.forbidden_terms ?? [],
    },
    account: {
      id: ctx.account.id,
      default_page_id: ctx.account.defaultPageId,
      default_ig_user_id: ctx.account.defaultIgUserId,
      eligible_page_ids: ctx.eligiblePageIds,
      has_instagram: Boolean(ctx.account.defaultIgUserId),
    },
    assets: new Map(
      assets.map((asset) => [
        asset.id,
        {
          id: asset.id,
          kind: asset.kind,
          aspect_ratio: asset.aspectRatio,
          validation_status: asset.validation.status,
          filename: asset.filename,
        },
      ]),
    ),
    ...(extra.objective ? { objective: extra.objective } : {}),
    ...(extra.variant !== undefined ? { variant: extra.variant } : {}),
    ...(extra.now ? { now: extra.now } : {}),
  };
}

/**
 * Criativos que os itens citam, sempre dentro do cliente do lote: ID de outro
 * cliente não entra no contexto de validação — logo o item não fica pronto.
 */
export async function assetsForDrafts(
  deps: ApiDeps,
  clientId: string,
  assetIds: readonly string[],
): Promise<AssetRow[]> {
  return getClientAssetsByIds(deps.db, clientId, [...new Set(assetIds)]);
}

/** Mesma leitura, mas ID fora do cliente é erro explícito em vez de item bloqueado. */
export async function assetsForDraftsStrict(
  deps: ApiDeps,
  clientId: string,
  assetIds: readonly string[],
): Promise<AssetRow[]> {
  const requested = [...new Set(assetIds)];
  const assets = await assetsForDrafts(deps, clientId, requested);
  const known = new Set(assets.map((asset) => asset.id));
  const missing = requested.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw unprocessable(`Criativos não encontrados neste cliente: ${missing.join(', ')}.`);
  }
  return assets;
}
