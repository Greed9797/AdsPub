import { adsManagerUrl } from '@adpub/config';
import type {
  AdDraftRow,
  AdAccountRow,
  AssetRow,
  BatchRefRow,
  BatchRow,
  ClientRow,
  PublicConnection,
  PublicWhatsappAccount,
  UserRow,
} from '@adpub/db';

export function whatsappAccountDto(row: PublicWhatsappAccount) {
  return {
    id: row.id,
    client_id: row.clientId,
    waba_id: row.wabaId,
    phone_number_id: row.phoneNumberId,
    display_name: row.displayName,
    display_phone: row.displayPhone,
    status: row.status,
    last_error: row.lastError ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function connectionDto(row: PublicConnection) {
  return {
    id: row.id,
    business_id: row.businessId,
    label: row.label,
    api_tier: row.apiTier,
    status: row.status,
    scopes: row.scopes,
    token_expires_at: row.tokenExpiresAt?.toISOString() ?? null,
    last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
    last_error: row.lastError ?? null,
  };
}

export function accountDto(row: AdAccountRow) {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    timezone_name: row.timezoneName,
    account_status: row.accountStatus,
    client_id: row.clientId,
    connection_id: row.connectionId,
    default_page_id: row.defaultPageId,
    default_ig_user_id: row.defaultIgUserId,
    default_pixel_id: row.defaultPixelId,
    daily_ad_cap: row.dailyAdCap,
    rate_usage: row.rateUsage,
    paused_until: row.pausedUntil?.toISOString() ?? null,
    last_synced_at: row.lastSyncedAt?.toISOString() ?? null,
    ads_manager_url: adsManagerUrl(row.id),
  };
}

export function clientDto(row: ClientRow) {
  return {
    id: row.id,
    name: row.name,
    voice_profile: row.voiceProfile,
    naming_template: row.namingTemplate,
    default_utm: row.defaultUtm,
    policy_mode: row.policyMode,
    landing_domains: row.landingDomains,
    advantage_creative_optout: row.advantageCreativeOptout,
  };
}

export function assetDto(row: AssetRow, thumbnailUrl?: string, url?: string) {
  return {
    id: row.id,
    client_id: row.clientId,
    kind: row.kind,
    filename: row.filename,
    mime: row.mime,
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    aspect_ratio: row.aspectRatio,
    duration_ms: row.durationMs,
    size_bytes: Number(row.sizeBytes),
    source: row.source,
    validation: row.validation,
    thumbnail_url: thumbnailUrl ?? null,
    url: url ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

export function draftDto(row: AdDraftRow, adAccountId?: string) {
  return {
    id: row.id,
    position: row.position,
    format: row.format,
    asset_ids: row.assetIds,
    copy: row.copy,
    name: row.name,
    campaign_ref: row.campaignRef,
    adset_ref: row.adsetRef,
    page_id: row.pageId,
    ig_user_id: row.igUserId,
    status: row.status,
    step: row.step,
    validation: row.validation,
    meta_ids: row.metaIds,
    effective_status: row.effectiveStatus,
    review_feedback: row.reviewFeedback,
    error: row.error,
    attempts: row.attempts,
    edited_fields: row.editedFields,
    version: row.version,
    published_at: row.publishedAt?.toISOString() ?? null,
    ads_manager_url:
      adAccountId && row.metaIds?.ad_id ? adsManagerUrl(adAccountId, row.metaIds.ad_id) : null,
  };
}

export function batchDto(row: BatchRow, items: AdDraftRow[] = []) {
  return {
    id: row.id,
    name: row.name,
    client_id: row.clientId,
    ad_account_id: row.adAccountId,
    created_by: row.createdBy,
    mode: row.mode,
    briefing: row.briefing,
    status: row.status,
    options: row.options,
    version: row.version,
    duplicated_from: row.duplicatedFrom,
    pending: (row.plan?.pending ?? []).map((p) =>
      p.item_index === undefined ? `${p.field}: ${p.reason}` : `item ${p.item_index + 1} — ${p.field}: ${p.reason}`,
    ),
    plan_notes: row.plan?.notes ?? '',
    items: items.map((item) => draftDto(item, row.adAccountId)),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/**
 * Campanha/conjunto compartilhado do lote. Sem isso uma ref travada é
 * invisível: os itens falham e a tela não diz o que precisa ser resolvido.
 */
export function refDto(row: BatchRefRow) {
  return {
    ref_key: row.refKey,
    kind: row.kind,
    state: row.state,
    meta_id: row.metaId,
    last_error: row.lastError,
    updated_at: row.updatedAt.toISOString(),
  };
}

export function userDto(row: UserRow, accountIds: string[] = []) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    ad_account_ids: accountIds,
  };
}
