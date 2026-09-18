import {
  getConnectionRow,
  listAccountsOfConnection,
  setAccountPages,
  updateConnectionStatus,
  upsertAccounts,
  upsertAdsetsCache,
  upsertCampaignsCache,
  upsertInstagramAccounts,
  upsertPages,
  upsertPixels,
} from '@adpub/db';
import { MetaApiError } from '@adpub/meta-client';
import {
  getMe,
  listAccountPages,
  listAdSets,
  listCampaigns,
  listIgAccounts,
  listOwnedAdAccounts,
  listPages,
  listPixels,
} from '@adpub/meta-client';
import type { Alerter } from '../alerts.js';
import type { WorkerContext } from '../context.js';
import type { MetaFactory } from '../meta.js';

export interface SyncJobData {
  connectionId: string;
}

export interface SyncResult {
  accounts: number;
  pages: number;
  instagram: number;
  pixels: number;
  campaigns: number;
  adsets: number;
}

/**
 * US1: sincroniza o inventário da BM. Nenhuma escrita na Meta — só leitura e
 * cache local, para o gestor nunca digitar ID à mão.
 */
export async function runSync(
  ctx: WorkerContext,
  meta: MetaFactory,
  alert: Alerter,
  data: SyncJobData,
): Promise<SyncResult> {
  const connection = await getConnectionRow(ctx.db, data.connectionId);
  if (!connection) throw new Error(`Conexão ${data.connectionId} não existe mais.`);
  // T-001-3: conexão sem autorização não reagenda nem gira em loop — o agendamento
  // periódico tenta de novo sozinho quando humano reconectar.
  if (connection.status !== 'active') {
    ctx.log.info(
      { connection: connection.id, status: connection.status },
      'sync pulado: conexão sem autorização',
    );
    return { accounts: 0, pages: 0, instagram: 0, pixels: 0, campaigns: 0, adsets: 0 };
  }
  const graph = await meta.forConnection(connection.id);

  try {
    await getMe(graph);
    const [accounts, pages, igAccounts] = await Promise.all([
      listOwnedAdAccounts(graph, connection.businessId),
      listPages(graph, connection.businessId),
      listIgAccounts(graph, connection.businessId),
    ]);

    await upsertPages(
      ctx.db,
      connection.id,
      pages.map((page) => ({
        id: page.id,
        name: page.name ?? page.id,
        instagramUserId: page.instagram_business_account?.id ?? null,
        raw: { ...page },
      })),
    );
    await upsertInstagramAccounts(
      ctx.db,
      connection.id,
      igAccounts.map((ig) => ({ id: ig.id, username: ig.username ?? '', raw: { ...ig } })),
    );
    await upsertAccounts(
      ctx.db,
      connection.id,
      accounts.map((account) => ({
        id: account.id,
        connectionId: connection.id,
        name: account.name ?? account.id,
        currency: account.currency ?? 'BRL',
        timezoneName: account.timezone_name ?? 'America/Sao_Paulo',
        accountStatus: account.account_status ?? 1,
      })),
    );

    let pixelCount = 0;
    let campaignCount = 0;
    let adsetCount = 0;

    for (const account of accounts) {
      const [accountPages, pixels, campaigns, adsets] = await Promise.all([
        listAccountPages(graph, account.id),
        listPixels(graph, account.id),
        listCampaigns(graph, account.id),
        listAdSets(graph, account.id),
      ]);

      await setAccountPages(
        ctx.db,
        account.id,
        accountPages.map((page) => page.id),
      );
      await upsertPixels(
        ctx.db,
        account.id,
        pixels.map((pixel) => ({ id: pixel.id, name: pixel.name ?? '', raw: { ...pixel } })),
      );
      await upsertCampaignsCache(
        ctx.db,
        account.id,
        campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name ?? '',
          objective: campaign.objective ?? '',
          status: campaign.status ?? '',
          effectiveStatus: campaign.effective_status ?? '',
          raw: { special_ad_categories: campaign.special_ad_categories ?? [] },
        })),
      );
      await upsertAdsetsCache(
        ctx.db,
        account.id,
        adsets.map((adset) => ({
          id: adset.id,
          campaignId: adset.campaign_id ?? null,
          name: adset.name ?? '',
          optimizationGoal: adset.optimization_goal ?? '',
          status: adset.status ?? '',
          effectiveStatus: adset.effective_status ?? '',
          raw: {
            billing_event: adset.billing_event ?? null,
            destination_type: adset.destination_type ?? null,
            promoted_object: adset.promoted_object ?? null,
          },
        })),
      );

      pixelCount += pixels.length;
      campaignCount += campaigns.length;
      adsetCount += adsets.length;
    }

    await updateConnectionStatus(ctx.db, connection.id, {
      status: 'active',
      apiTier: graph.lastUsage?.tier ?? connection.apiTier,
      lastError: null,
    });

    const result: SyncResult = {
      accounts: accounts.length,
      pages: pages.length,
      instagram: igAccounts.length,
      pixels: pixelCount,
      campaigns: campaignCount,
      adsets: adsetCount,
    };
    ctx.log.info({ connection: connection.id, ...result }, 'sincronização concluída');
    return result;
  } catch (error) {
    if (error instanceof MetaApiError && error.isAuth) {
      await meta.handleAuthFailure(connection.id, error.translated.title);
    } else {
      // Falha que não é de autorização (rede, 5xx, ativo inacessível) não
      // derruba a conexão: com `needs_attention` o próprio sync passaria a
      // pular no early-return acima e nem o retry do job nem o ciclo de 6h
      // tentariam de novo — só humano reativaria. O motivo fica em
      // `last_error`, à vista em /contas, e a conexão segue tentável.
      await updateConnectionStatus(ctx.db, connection.id, {
        lastError: error instanceof Error ? error.message : String(error),
      });
      await alert({
        title: 'Falha ao sincronizar a BM',
        detail: error instanceof Error ? error.message : String(error),
        severity: 'warning',
        context: { connection_id: connection.id },
      });
    }
    throw error;
  }
}

export async function accountsToRefresh(ctx: WorkerContext, connectionId: string) {
  return listAccountsOfConnection(ctx.db, connectionId);
}
