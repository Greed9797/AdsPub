import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type {
  BatchOptions,
  BatchPlan,
  Copy,
  DraftError,
  ItemValidation,
  MetaIds,
  ObjectRef,
  VoiceProfile,
} from '@adpub/shared';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const roleEnum = pgEnum('role', ['admin', 'coordinator', 'manager', 'viewer']);
export const apiTierEnum = pgEnum('api_tier', ['limited', 'full', 'unknown']);
export const connectionStatusEnum = pgEnum('connection_status', [
  'active',
  'needs_attention',
  'revoked',
]);
export const policyModeEnum = pgEnum('policy_mode', ['warn', 'block']);
export const assetKindEnum = pgEnum('asset_kind', ['image', 'video']);
export const assetSourceEnum = pgEnum('asset_source', ['drive', 'upload']);
export const batchModeEnum = pgEnum('batch_mode', ['ai', 'manual']);
export const batchStatusEnum = pgEnum('batch_status', [
  'draft',
  'ready',
  'blocked',
  'queued',
  'publishing',
  'done',
  'partial',
  'failed',
  'archived',
]);
export const adFormatEnum = pgEnum('ad_format', ['single_image', 'single_video', 'carousel']);
export const adDraftStatusEnum = pgEnum('ad_draft_status', [
  'draft',
  'blocked',
  'ready',
  'queued',
  'uploading_media',
  'ensuring_campaign',
  'ensuring_adset',
  'creating_creative',
  'creating_ad',
  'published',
  'in_review',
  'approved',
  'disapproved',
  'failed',
]);
export const publishStepEnum = pgEnum('publish_step', [
  'upload_media',
  'ensure_campaign',
  'ensure_adset',
  'create_creative',
  'create_ad',
  'done',
]);
export const refKindEnum = pgEnum('ref_kind', ['campaign', 'adset']);
export const refStateEnum = pgEnum('ref_state', ['pending', 'created', 'failed']);
export const jobStateEnum = pgEnum('job_state', [
  'waiting',
  'active',
  'delayed',
  'completed',
  'failed',
]);
export const aiPurposeEnum = pgEnum('ai_purpose', ['plan', 'copy', 'policy']);
export const aiFeedbackEnum = pgEnum('ai_feedback', ['used', 'edited', 'rejected']);

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  role: roleEnum('role').notNull().default('manager'),
  googleSub: text('google_sub'),
  active: boolean('active').notNull().default(true),
  createdAt,
  updatedAt,
});

export const metaConnections = pgTable('meta_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: text('business_id').notNull(),
  label: text('label').notNull(),
  tokenCiphertext: bytea('token_ciphertext').notNull(),
  tokenIv: bytea('token_iv').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
  apiTier: apiTierEnum('api_tier').notNull().default('unknown'),
  status: connectionStatusEnum('status').notNull().default('active'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt,
  updatedAt,
});

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  voiceProfile: jsonb('voice_profile').$type<VoiceProfile>().notNull(),
  namingTemplate: text('naming_template')
    .notNull()
    .default('{cliente}_{objetivo}_{data:YYYYMMDD}_{criativo}_{formato}_{v}'),
  defaultUtm: jsonb('default_utm').$type<Record<string, string>>().notNull().default({}),
  policyMode: policyModeEnum('policy_mode').notNull().default('warn'),
  landingDomains: text('landing_domains').array().notNull().default(sql`'{}'::text[]`),
  advantageCreativeOptout: boolean('advantage_creative_optout').notNull().default(true),
  createdAt,
  updatedAt,
});

export const adAccounts = pgTable(
  'ad_accounts',
  {
    id: text('id').primaryKey(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => metaConnections.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    name: text('name').notNull().default(''),
    currency: text('currency').notNull().default(''),
    timezoneName: text('timezone_name').notNull().default(''),
    accountStatus: integer('account_status').notNull().default(0),
    defaultPageId: text('default_page_id'),
    defaultIgUserId: text('default_ig_user_id'),
    defaultPixelId: text('default_pixel_id'),
    dailyAdCap: integer('daily_ad_cap').notNull().default(100),
    activeAdsCount: integer('active_ads_count').notNull().default(0),
    rateUsage: jsonb('rate_usage').$type<Record<string, unknown>>().notNull().default({}),
    pausedUntil: timestamp('paused_until', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [index('ad_accounts_client_idx').on(t.clientId)],
);

export const userAdAccounts = pgTable(
  'user_ad_accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    adAccountId: text('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.userId, t.adAccountId] })],
);

export const pages = pgTable('pages', {
  id: text('id').primaryKey(),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => metaConnections.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  instagramUserId: text('instagram_user_id'),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

export const instagramAccounts = pgTable('instagram_accounts', {
  id: text('id').primaryKey(),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => metaConnections.id, { onDelete: 'cascade' }),
  username: text('username').notNull().default(''),
  pageId: text('page_id'),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pixels = pgTable('pixels', {
  id: text('id').primaryKey(),
  adAccountId: text('ad_account_id')
    .notNull()
    .references(() => adAccounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountPages = pgTable(
  'account_pages',
  {
    adAccountId: text('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    pageId: text('page_id').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.adAccountId, t.pageId] })],
);

export const campaignsCache = pgTable(
  'campaigns_cache',
  {
    id: text('id').primaryKey(),
    adAccountId: text('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    objective: text('objective').notNull().default(''),
    status: text('status').notNull().default(''),
    effectiveStatus: text('effective_status').notNull().default(''),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('campaigns_cache_account_idx').on(t.adAccountId)],
);

export const adsetsCache = pgTable(
  'adsets_cache',
  {
    id: text('id').primaryKey(),
    adAccountId: text('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    campaignId: text('campaign_id'),
    name: text('name').notNull().default(''),
    optimizationGoal: text('optimization_goal').notNull().default(''),
    status: text('status').notNull().default(''),
    effectiveStatus: text('effective_status').notNull().default(''),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('adsets_cache_account_idx').on(t.adAccountId, t.campaignId)],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    sha256: text('sha256').notNull(),
    kind: assetKindEnum('kind').notNull(),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    aspectRatio: text('aspect_ratio').notNull().default('other'),
    durationMs: integer('duration_ms'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
    source: assetSourceEnum('source').notNull(),
    driveFileId: text('drive_file_id'),
    validation: jsonb('validation')
      .$type<{ status: 'ok' | 'rejected'; errors: string[]; warnings: string[] }>()
      .notNull(),
    thumbnailKey: text('thumbnail_key'),
    createdAt,
    updatedAt,
  },
  (t) => [unique('assets_client_sha_unique').on(t.clientId, t.sha256)],
);

export const assetUploads = pgTable(
  'asset_uploads',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    adAccountId: text('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    metaImageHash: text('meta_image_hash'),
    metaVideoId: text('meta_video_id'),
    videoStatus: text('video_status'),
    thumbnailHash: text('thumbnail_hash'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.adAccountId] })],
);

export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    adAccountId: text('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'restrict' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    briefing: text('briefing'),
    mode: batchModeEnum('mode').notNull(),
    plan: jsonb('plan').$type<BatchPlan | null>(),
    status: batchStatusEnum('status').notNull().default('draft'),
    options: jsonb('options').$type<BatchOptions>().notNull(),
    duplicatedFrom: uuid('duplicated_from'),
    version: integer('version').notNull().default(1),
    createdAt,
    updatedAt,
  },
  (t) => [index('batches_account_idx').on(t.adAccountId, t.status)],
);

export const adDrafts = pgTable(
  'ad_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    campaignRef: jsonb('campaign_ref').$type<ObjectRef>().notNull(),
    adsetRef: jsonb('adset_ref').$type<ObjectRef>().notNull(),
    format: adFormatEnum('format').notNull(),
    assetIds: uuid('asset_ids').array().notNull(),
    copy: jsonb('copy').$type<Copy>().notNull(),
    name: text('name').notNull(),
    pageId: text('page_id').notNull().default(''),
    igUserId: text('ig_user_id'),
    status: adDraftStatusEnum('status').notNull().default('draft'),
    step: publishStepEnum('step').notNull().default('upload_media'),
    validation: jsonb('validation').$type<ItemValidation | null>(),
    metaIds: jsonb('meta_ids').$type<MetaIds>().notNull(),
    effectiveStatus: text('effective_status'),
    reviewFeedback: jsonb('review_feedback').$type<Record<string, unknown> | null>(),
    error: jsonb('error').$type<DraftError | null>(),
    attempts: integer('attempts').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    editedFields: text('edited_fields').array().notNull().default(sql`'{}'::text[]`),
    version: integer('version').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('ad_drafts_batch_position_unique').on(t.batchId, t.position),
    index('ad_drafts_status_idx').on(t.status),
  ],
);

export const batchRefs = pgTable(
  'batch_refs',
  {
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    refKey: text('ref_key').notNull(),
    kind: refKindEnum('kind').notNull(),
    metaId: text('meta_id'),
    state: refStateEnum('state').notNull().default('pending'),
    spec: jsonb('spec').$type<Record<string, unknown>>().notNull().default({}),
    lastError: text('last_error'),
    createdAt,
    updatedAt,
  },
  (t) => [primaryKey({ columns: [t.batchId, t.refKey] })],
);

export const publishJobs = pgTable(
  'publish_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adDraftId: uuid('ad_draft_id')
      .notNull()
      .references(() => adDrafts.id, { onDelete: 'cascade' }),
    queue: text('queue').notNull(),
    bullJobId: text('bull_job_id'),
    step: publishStepEnum('step').notNull(),
    state: jobStateEnum('state').notNull().default('waiting'),
    attempts: integer('attempts').notNull().default(0),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastError: jsonb('last_error').$type<Record<string, unknown> | null>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [index('publish_jobs_draft_idx').on(t.adDraftId)],
);

export const metaApiCalls = pgTable(
  'meta_api_calls',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    adAccountId: text('ad_account_id'),
    adDraftId: uuid('ad_draft_id'),
    method: text('method').notNull(),
    endpoint: text('endpoint').notNull(),
    apiVersion: text('api_version').notNull(),
    statusCode: integer('status_code').notNull().default(0),
    errorCode: integer('error_code'),
    errorSubcode: integer('error_subcode'),
    latencyMs: integer('latency_ms').notNull().default(0),
    usage: jsonb('usage').$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
  },
  (t) => [index('meta_api_calls_account_idx').on(t.adAccountId, t.createdAt)],
);

export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'cascade' }),
    purpose: aiPurposeEnum('purpose').notNull(),
    promptVersion: text('prompt_version').notNull(),
    model: text('model').notNull(),
    inputHash: text('input_hash').notNull(),
    input: jsonb('input').$type<Record<string, unknown>>().notNull(),
    output: jsonb('output').$type<Record<string, unknown>>().notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms').notNull().default(0),
    feedback: aiFeedbackEnum('feedback'),
    createdAt,
  },
  (t) => [unique('ai_generations_cache_unique').on(t.purpose, t.promptVersion, t.inputHash)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before').$type<unknown>(),
    after: jsonb('after').$type<unknown>(),
    metaRequest: jsonb('meta_request').$type<unknown>(),
    metaResponse: jsonb('meta_response').$type<unknown>(),
    ip: text('ip'),
    createdAt,
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId),
    index('audit_log_created_idx').on(t.createdAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type MetaConnectionRow = typeof metaConnections.$inferSelect;
export type ClientRow = typeof clients.$inferSelect;
export type AdAccountRow = typeof adAccounts.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type AssetUploadRow = typeof assetUploads.$inferSelect;
export type BatchRow = typeof batches.$inferSelect;
export type AdDraftRow = typeof adDrafts.$inferSelect;
export type BatchRefRow = typeof batchRefs.$inferSelect;
export type PublishJobRow = typeof publishJobs.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type AiGenerationRow = typeof aiGenerations.$inferSelect;
export type CampaignCacheRow = typeof campaignsCache.$inferSelect;
export type AdsetCacheRow = typeof adsetsCache.$inferSelect;
