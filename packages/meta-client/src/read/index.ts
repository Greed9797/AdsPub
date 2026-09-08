import { GRAPH_BATCH_MAX } from '@adpub/config';
import { actPath, type MetaClient } from '../client.js';

/** Leituras da Graph API (T014). Nenhuma escrita aqui. */

export interface Paged<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

export interface MeResponse {
  id: string;
  name?: string;
}

export interface OwnedAdAccount {
  id: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
}

export interface PageRef {
  id: string;
  name?: string;
  instagram_business_account?: { id: string; username?: string };
}

export interface IgAccountRef {
  id: string;
  username?: string;
}

export interface PixelRef {
  id: string;
  name?: string;
}

export interface CampaignRef {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  special_ad_categories?: string[];
}

export interface AdSetRef {
  id: string;
  name?: string;
  campaign_id?: string;
  optimization_goal?: string;
  status?: string;
  effective_status?: string;
  billing_event?: string;
  destination_type?: string;
  promoted_object?: Record<string, unknown>;
}

export interface AdStatus {
  id: string;
  effective_status?: string;
  configured_status?: string;
  ad_review_feedback?: Record<string, unknown>;
}

async function readAllPages<T>(
  client: MetaClient,
  path: string,
  params: Record<string, string | number> = {},
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.get<Paged<T>>(path, {
      limit: 100,
      ...params,
      ...(after ? { after } : {}),
    });
    out.push(...(response.data ?? []));
    after = response.paging?.cursors?.after;
    if (!after || !response.paging?.next) break;
  }
  return out;
}

export async function getMe(client: MetaClient): Promise<MeResponse> {
  return client.get<MeResponse>('me', { fields: 'id,name' });
}

export async function listOwnedAdAccounts(
  client: MetaClient,
  businessId: string,
): Promise<OwnedAdAccount[]> {
  return readAllPages<OwnedAdAccount>(client, `${businessId}/owned_ad_accounts`, {
    fields: 'id,account_id,name,currency,timezone_name,account_status',
  });
}

export async function listClientAdAccounts(
  client: MetaClient,
  businessId: string,
): Promise<OwnedAdAccount[]> {
  return readAllPages<OwnedAdAccount>(client, `${businessId}/client_ad_accounts`, {
    fields: 'id,account_id,name,currency,timezone_name,account_status',
  });
}

export async function listPages(client: MetaClient, businessId: string): Promise<PageRef[]> {
  return readAllPages<PageRef>(client, `${businessId}/owned_pages`, {
    fields: 'id,name,instagram_business_account{id,username}',
  });
}

export async function listIgAccounts(
  client: MetaClient,
  businessId: string,
): Promise<IgAccountRef[]> {
  return readAllPages<IgAccountRef>(client, `${businessId}/owned_instagram_accounts`, {
    fields: 'id,username',
  });
}

export async function listPixels(client: MetaClient, adAccountId: string): Promise<PixelRef[]> {
  return readAllPages<PixelRef>(client, actPath(adAccountId, 'adspixels'), { fields: 'id,name' });
}

export async function listAccountPages(
  client: MetaClient,
  adAccountId: string,
): Promise<PageRef[]> {
  return readAllPages<PageRef>(client, actPath(adAccountId, 'promote_pages'), {
    fields: 'id,name,instagram_business_account{id,username}',
  });
}

export async function listCampaigns(
  client: MetaClient,
  adAccountId: string,
): Promise<CampaignRef[]> {
  return readAllPages<CampaignRef>(client, actPath(adAccountId, 'campaigns'), {
    fields: 'id,name,objective,status,effective_status,special_ad_categories',
    effective_status: JSON.stringify(['ACTIVE', 'PAUSED']),
  });
}

export async function listAdSets(client: MetaClient, adAccountId: string): Promise<AdSetRef[]> {
  return readAllPages<AdSetRef>(client, actPath(adAccountId, 'adsets'), {
    fields:
      'id,name,campaign_id,optimization_goal,billing_event,destination_type,promoted_object,status,effective_status',
    effective_status: JSON.stringify(['ACTIVE', 'PAUSED']),
  });
}

export async function getAdAccount(
  client: MetaClient,
  adAccountId: string,
): Promise<OwnedAdAccount & { amount_spent?: string }> {
  return client.get(actPath(adAccountId), {
    fields: 'id,account_id,name,currency,timezone_name,account_status,amount_spent',
  });
}

/** R11: status de revisão em batch de até 50 IDs. */
export async function getAdsStatus(client: MetaClient, adIds: readonly string[]): Promise<AdStatus[]> {
  const out: AdStatus[] = [];
  for (let i = 0; i < adIds.length; i += GRAPH_BATCH_MAX) {
    const chunk = adIds.slice(i, i + GRAPH_BATCH_MAX);
    const responses = await client.batch<AdStatus>(
      chunk.map((id) => ({
        method: 'GET' as const,
        relative_url: `${id}?fields=effective_status,configured_status,ad_review_feedback`,
      })),
    );
    responses.forEach((response, index) => {
      const id = chunk[index];
      if (!id) return;
      if (response.code === 200 && response.body && typeof response.body === 'object') {
        out.push({ ...(response.body as AdStatus), id });
      }
    });
  }
  return out;
}
