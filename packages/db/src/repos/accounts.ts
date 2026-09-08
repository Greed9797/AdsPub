import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AdAccountDefaults } from '@adpub/shared';
import {
  accountPages,
  adAccounts,
  adsetsCache,
  campaignsCache,
  instagramAccounts,
  pages,
  pixels,
  userAdAccounts,
} from '../schema.js';
import type { AdAccountRow, AdsetCacheRow, CampaignCacheRow } from '../schema.js';
import type { Database } from '../client.js';

export interface AccountScope {
  userId: string;
  role: 'admin' | 'coordinator' | 'manager' | 'viewer';
}

/** FR-016: admin/coordinator veem tudo; manager/viewer só o escopo atribuído. */
export async function listVisibleAccounts(
  db: Database,
  scope: AccountScope,
  filter: { clientId?: string } = {},
): Promise<AdAccountRow[]> {
  const clientFilter = filter.clientId ? eq(adAccounts.clientId, filter.clientId) : undefined;
  if (scope.role === 'admin' || scope.role === 'coordinator') {
    return db
      .select()
      .from(adAccounts)
      .where(clientFilter)
      .orderBy(adAccounts.name);
  }
  const rows = await db
    .select({ account: adAccounts })
    .from(userAdAccounts)
    .innerJoin(adAccounts, eq(userAdAccounts.adAccountId, adAccounts.id))
    .where(
      clientFilter
        ? and(eq(userAdAccounts.userId, scope.userId), clientFilter)
        : eq(userAdAccounts.userId, scope.userId),
    );
  return rows.map((r) => r.account);
}

export async function canAccessAccount(
  db: Database,
  scope: AccountScope,
  adAccountId: string,
): Promise<boolean> {
  if (scope.role === 'admin' || scope.role === 'coordinator') {
    const [row] = await db
      .select({ id: adAccounts.id })
      .from(adAccounts)
      .where(eq(adAccounts.id, adAccountId));
    return Boolean(row);
  }
  const [row] = await db
    .select({ id: userAdAccounts.adAccountId })
    .from(userAdAccounts)
    .where(
      and(eq(userAdAccounts.userId, scope.userId), eq(userAdAccounts.adAccountId, adAccountId)),
    );
  return Boolean(row);
}

export async function getAccount(db: Database, id: string): Promise<AdAccountRow | undefined> {
  const [row] = await db.select().from(adAccounts).where(eq(adAccounts.id, id));
  return row;
}

export async function updateAccountDefaults(
  db: Database,
  id: string,
  defaults: AdAccountDefaults,
): Promise<AdAccountRow | undefined> {
  const patch: Partial<AdAccountRow> = { updatedAt: new Date() };
  if (defaults.client_id !== undefined) patch.clientId = defaults.client_id;
  if (defaults.default_page_id !== undefined) patch.defaultPageId = defaults.default_page_id;
  if (defaults.default_ig_user_id !== undefined)
    patch.defaultIgUserId = defaults.default_ig_user_id;
  if (defaults.default_pixel_id !== undefined) patch.defaultPixelId = defaults.default_pixel_id;
  if (defaults.daily_ad_cap !== undefined) patch.dailyAdCap = defaults.daily_ad_cap;

  const [row] = await db.update(adAccounts).set(patch).where(eq(adAccounts.id, id)).returning();
  return row;
}

export async function upsertAccounts(
  db: Database,
  connectionId: string,
  rows: Array<{
    id: string;
    name: string;
    currency: string;
    timezoneName: string;
    accountStatus: number;
  }>,
): Promise<number> {
  if (rows.length === 0) return 0;
  await db
    .insert(adAccounts)
    .values(rows.map((r) => ({ ...r, connectionId, lastSyncedAt: new Date() })))
    .onConflictDoUpdate({
      target: adAccounts.id,
      set: {
        name: sql`excluded.name`,
        currency: sql`excluded.currency`,
        timezoneName: sql`excluded.timezone_name`,
        accountStatus: sql`excluded.account_status`,
        connectionId: sql`excluded.connection_id`,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  return rows.length;
}

export async function upsertPages(
  db: Database,
  connectionId: string,
  rows: Array<{ id: string; name: string; instagramUserId?: string | null; raw: Record<string, unknown> }>,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(pages)
    .values(
      rows.map((r) => ({
        id: r.id,
        connectionId,
        name: r.name,
        instagramUserId: r.instagramUserId ?? null,
        raw: r.raw,
        syncedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: pages.id,
      set: {
        name: sql`excluded.name`,
        instagramUserId: sql`excluded.instagram_user_id`,
        raw: sql`excluded.raw`,
        syncedAt: new Date(),
      },
    });
}

export async function upsertInstagramAccounts(
  db: Database,
  connectionId: string,
  rows: Array<{ id: string; username: string; pageId?: string | null; raw: Record<string, unknown> }>,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(instagramAccounts)
    .values(
      rows.map((r) => ({
        id: r.id,
        connectionId,
        username: r.username,
        pageId: r.pageId ?? null,
        raw: r.raw,
        syncedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: instagramAccounts.id,
      set: {
        username: sql`excluded.username`,
        pageId: sql`excluded.page_id`,
        raw: sql`excluded.raw`,
        syncedAt: new Date(),
      },
    });
}

export async function upsertPixels(
  db: Database,
  adAccountId: string,
  rows: Array<{ id: string; name: string; raw: Record<string, unknown> }>,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(pixels)
    .values(rows.map((r) => ({ ...r, adAccountId, syncedAt: new Date() })))
    .onConflictDoUpdate({
      target: pixels.id,
      set: { name: sql`excluded.name`, raw: sql`excluded.raw`, syncedAt: new Date() },
    });
}

export async function setAccountPages(
  db: Database,
  adAccountId: string,
  pageIds: readonly string[],
): Promise<void> {
  await db.delete(accountPages).where(eq(accountPages.adAccountId, adAccountId));
  if (pageIds.length === 0) return;
  await db
    .insert(accountPages)
    .values(pageIds.map((pageId) => ({ adAccountId, pageId })))
    .onConflictDoNothing();
}

export async function listAccountPageIds(db: Database, adAccountId: string): Promise<string[]> {
  const rows = await db
    .select({ pageId: accountPages.pageId })
    .from(accountPages)
    .where(eq(accountPages.adAccountId, adAccountId));
  return rows.map((r) => r.pageId);
}

export async function upsertCampaignsCache(
  db: Database,
  adAccountId: string,
  rows: Array<Omit<CampaignCacheRow, 'adAccountId' | 'syncedAt'>>,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(campaignsCache)
    .values(rows.map((r) => ({ ...r, adAccountId, syncedAt: new Date() })))
    .onConflictDoUpdate({
      target: campaignsCache.id,
      set: {
        name: sql`excluded.name`,
        objective: sql`excluded.objective`,
        status: sql`excluded.status`,
        effectiveStatus: sql`excluded.effective_status`,
        raw: sql`excluded.raw`,
        syncedAt: new Date(),
      },
    });
}

export async function upsertAdsetsCache(
  db: Database,
  adAccountId: string,
  rows: Array<Omit<AdsetCacheRow, 'adAccountId' | 'syncedAt'>>,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(adsetsCache)
    .values(rows.map((r) => ({ ...r, adAccountId, syncedAt: new Date() })))
    .onConflictDoUpdate({
      target: adsetsCache.id,
      set: {
        name: sql`excluded.name`,
        campaignId: sql`excluded.campaign_id`,
        optimizationGoal: sql`excluded.optimization_goal`,
        status: sql`excluded.status`,
        effectiveStatus: sql`excluded.effective_status`,
        raw: sql`excluded.raw`,
        syncedAt: new Date(),
      },
    });
}

export async function listCampaignsCache(
  db: Database,
  adAccountId: string,
  q?: string,
): Promise<CampaignCacheRow[]> {
  const rows = await db
    .select()
    .from(campaignsCache)
    .where(eq(campaignsCache.adAccountId, adAccountId));
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter((r) => r.name.toLowerCase().includes(needle));
}

export async function listAdsetsCache(
  db: Database,
  adAccountId: string,
  campaignId?: string,
): Promise<AdsetCacheRow[]> {
  const filters = [eq(adsetsCache.adAccountId, adAccountId)];
  if (campaignId) filters.push(eq(adsetsCache.campaignId, campaignId));
  return db
    .select()
    .from(adsetsCache)
    .where(and(...filters));
}

/** R6: reflete headers de uso e pausa a fila da conta. */
export async function recordAccountUsage(
  db: Database,
  adAccountId: string,
  usage: Record<string, unknown>,
  pausedUntil?: Date | null,
): Promise<void> {
  const patch: Record<string, unknown> = { rateUsage: usage, updatedAt: new Date() };
  if (pausedUntil !== undefined) patch.pausedUntil = pausedUntil;
  await db.update(adAccounts).set(patch).where(eq(adAccounts.id, adAccountId));
}

/** Contas com fila pausada agora (rate limit ou token inválido). */
export async function accountsPausedNow(db: Database): Promise<AdAccountRow[]> {
  return db
    .select()
    .from(adAccounts)
    .where(sql`${adAccounts.pausedUntil} is not null and ${adAccounts.pausedUntil} > now()`);
}

export async function listAccountsByIds(db: Database, ids: string[]): Promise<AdAccountRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(adAccounts).where(inArray(adAccounts.id, ids));
}

export async function listAccountsOfConnection(
  db: Database,
  connectionId: string,
): Promise<AdAccountRow[]> {
  return db.select().from(adAccounts).where(eq(adAccounts.connectionId, connectionId));
}
