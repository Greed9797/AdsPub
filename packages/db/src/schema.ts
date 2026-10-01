import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  BatchOptions,
  BatchPlan,
  Copy,
  DraftError,
  ItemValidation,
  MetaIds,
  ObjectRef,
  VariantManifest,
  VoiceProfile,
} from '@adpub/shared';
import type {
  ReportImportContext,
  RowIssue,
  StagedObservation,
} from '@adpub/reports';

/** T-007-2: espelho estrutural (canônico em @adpub/creative-intel). */
export interface ReportFilterLike {
  from: string;
  to: string;
  source: string;
  level: string;
}
export interface ReportSnapshotLike {
  accountId: string;
  from: string;
  to: string;
  source: string;
  totals: { spend: number; results: number | null };
  rows: Array<{ id: string; name: string; spend: number; results: number | null; cpa: number | null }>;
  hasMetrics: boolean;
  hasMedia: boolean;
  selectionCoverage: string;
  content: Array<{ assetId: string; observations: Array<{ tipo: string; texto: string }> }>;
}
export interface ReportOutputLike {
  performance_findings: unknown[];
  content_observations: string[];
  hypotheses: unknown[];
  recommended_tests: unknown[];
  limitations: string[];
}

/** T-006-2: espelho estrutural (canônico em @adpub/creative-intel). */
export interface ContentAnalysisLike {
  observations: Array<{
    tipo: string;
    texto: string;
    evidence_refs: Array<{ kind: string; t?: number; detail: string }>;
  }>;
  limitations: string[];
}

/** T-005-2: espelho estrutural da política (versão canônica em @adpub/analytics). */
export interface SufficiencyPolicyLike {
  version: string;
  minSpend: number;
  minResults: number;
  minDays: number;
  maturityDays: number;
}

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
  'needs_reconciliation',
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
export const refStateEnum = pgEnum('ref_state', [
  'pending',
  'created',
  'failed',
  'needs_reconciliation',
]);
export const jobStateEnum = pgEnum('job_state', [
  'waiting',
  'active',
  'delayed',
  'completed',
  'failed',
]);
export const aiPurposeEnum = pgEnum('ai_purpose', ['plan', 'copy', 'policy']);
export const aiFeedbackEnum = pgEnum('ai_feedback', ['used', 'edited', 'rejected']);
export const analysisJobStatusEnum = pgEnum('analysis_job_status', [
  'queued',
  'running',
  'done',
  'failed',
]);

/** Drive observável: o job do banco acompanha a fila do Redis. */
export const driveImportStatusEnum = pgEnum('drive_import_status', [
  'queued',
  'running',
  'done',
  'failed',
]);

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  role: roleEnum('role').notNull().default('manager'),
  passwordHash: text('password_hash'),
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
  /** T-005-2: política de suficiência versionada (nula = ranking descritivo). */
  metricPolicy: jsonb('metric_policy').$type<SufficiencyPolicyLike | null>(),
  createdAt,
  updatedAt,
});

export const whatsappAccounts = pgTable(
  'whatsapp_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    wabaId: text('waba_id').notNull(),
    phoneNumberId: text('phone_number_id').notNull(),
    displayName: text('display_name').notNull().default(''),
    displayPhone: text('display_phone').notNull().default(''),
    tokenCiphertext: bytea('token_ciphertext').notNull(),
    tokenIv: bytea('token_iv').notNull(),
    status: text('status').notNull().default('active'),
    lastError: text('last_error'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('whatsapp_accounts_waba_phone_unique').on(t.wabaId, t.phoneNumberId),
    index('whatsapp_accounts_client_idx').on(t.clientId),
  ],
);

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
    /** T-007-2: rascunho nascido de relatório (SPEC-008 continua o ciclo). */
    sourceReportId: uuid('source_report_id').references(() => analysisReports.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    /** T-000-3: aprovação vinculada à revisão — publicar exige fingerprint igual. */
    approvalFingerprint: text('approval_fingerprint'),
    /**
     * A12: qual geração de plano este lote consumiu (inclusive quando veio do
     * cache) e o que aconteceu com ela. Sem isso o feedback ficaria preso à
     * linha de cache, que é compartilhada por vários lotes.
     */
    planGenerationId: uuid('plan_generation_id').references((): AnyPgColumn => aiGenerations.id, {
      onDelete: 'set null',
    }),
    planFeedback: aiFeedbackEnum('plan_feedback'),
    /** Quantas vezes o plano foi descartado por regeneração. */
    planRegenerations: integer('plan_regenerations').notNull().default(0),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
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
    /** T-002-1: variante de comunicação derivada na validação (nulável p/ legado). */
    variantId: uuid('variant_id').references(() => creativeVariants.id, { onDelete: 'set null' }),
    /** T-000-3: tempos de estágio (FR-000-06) — humano/fila/Meta separados. */
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    queuedAt: timestamp('queued_at', { withTimezone: true }),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    /** Dono da execução em curso (por job, não por worker) e validade do lease. */
    leaseOwner: text('lease_owner'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('ad_drafts_batch_position_unique').on(t.batchId, t.position),
    index('ad_drafts_status_idx').on(t.status),
  ],
);

/**
 * T-003-2: importação de relatório tabular. Arquivo bruto privado + contexto
 * + mapping versionado + staging. Commit grava observações imutáveis.
 */
export const reportImports = pgTable(
  'report_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    adAccountId: text('ad_account_id').references(() => adAccounts.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    mime: text('mime').notNull().default('text/csv'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    status: text('status').notNull().default('uploaded'),
    context: jsonb('context').$type<ReportImportContext>().notNull(),
    mapping: jsonb('mapping').$type<Record<string, string | null>>().notNull().default({}),    mappingVersion: text('mapping_version').notNull().default('v1'),
    revision: integer('revision').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt,
    updatedAt,
  },
  (t) => [index('report_imports_client_idx').on(t.clientId)],
);

export const reportRows = pgTable(
  'report_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importId: uuid('import_id')
      .notNull()
      .references(() => reportImports.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    raw: jsonb('raw').$type<Record<string, string>>().notNull(),
    mapped: jsonb('mapped').$type<StagedObservation | null>(),
    status: text('status').notNull().default('pending'),
    errors: jsonb('errors').$type<RowIssue[]>().notNull().default([]),
  },
  (t) => [unique('report_rows_import_row_unique').on(t.importId, t.rowNumber)],
);

export const metricObservations = pgTable(
  'metric_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    adAccountId: text('ad_account_id').references(() => adAccounts.id, { onDelete: 'set null' }),
    importId: uuid('import_id').references(() => reportImports.id, { onDelete: 'restrict' }),
    localRowId: text('local_row_id').notNull(),
    adId: text('ad_id'),
    adName: text('ad_name').notNull().default(''),
    entityLevel: text('entity_level').notNull(),
    dateStart: date('date_start').notNull(),
    dateStop: date('date_stop').notNull(),
    grain: text('grain').notNull(),
    attribution: text('attribution').notNull().default('unknown'),
    coverage: text('coverage').notNull().default('unknown'),
    /** T-005-2: sem moeda não há ranking entre fontes (AC-005-05). */
    currency: text('currency').notNull().default('unknown'),
    breakdownSignature: text('breakdown_signature').notNull().default(''),
    metricDefinitionVersion: text('metric_definition_version').notNull().default('v1'),
    metrics: jsonb('metrics').$type<Record<string, number | string>>().notNull(),
    source: text('source').notNull().default('file'),
    /** T-004-2: extração que gerou a linha (relatório salvo segue no antigo). */
    snapshotId: uuid('snapshot_id').references(() => insightSnapshots.id, { onDelete: 'set null' }),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('metric_observations_import_row_unique').on(t.importId, t.localRowId),
    unique('metric_observations_canonical_unique').on(t.clientId, t.source, t.localRowId),
    index('metric_observations_client_idx').on(t.clientId, t.adId),
  ],
);

/**
 * T-004-2: snapshot de extração da API — identidade de uma consulta
 * (conta+nível+campos+janela+atribuição+breakdowns). Reextração cria outro
 * snapshot; a canônica aponta p/ o novo sem reescrever relatório salvo.
 */
export const insightSnapshots = pgTable(
  'insight_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    adAccountId: text('ad_account_id').references(() => adAccounts.id, { onDelete: 'set null' }),
    fingerprint: text('fingerprint').notNull(),
    level: text('level').notNull(),
    fields: text('fields').array().notNull().default(sql`'{}'::text[]`),
    dateStart: date('date_start').notNull(),
    dateStop: date('date_stop').notNull(),
    grain: text('grain').notNull().default('daily'),
    attribution: text('attribution').notNull().default('unknown'),
    breakdownSignature: text('breakdown_signature').notNull().default(''),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    completeness: text('completeness').notNull().default('complete'),
    pages: integer('pages').notNull().default(1),
    sourceParams: jsonb('source_params').$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
  },
  (t) => [
    unique('insight_snapshots_client_fp_unique').on(t.clientId, t.fingerprint),
    index('insight_snapshots_account_idx').on(t.adAccountId),
  ],
);

/** T-004-2: checkpoint de sincronização por conta. */
export const accountSyncState = pgTable('account_sync_state', {
  adAccountId: text('ad_account_id')
    .primaryKey()
    .references(() => adAccounts.id, { onDelete: 'cascade' }),
  lastDailyCovered: date('last_daily_covered'),
  movingWindowStart: date('moving_window_start'),
  movingWindowEnd: date('moving_window_end'),
  pendingReportRunId: text('pending_report_run_id'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  updatedAt,
});

/**
 * T-007-2: relatório imutável com cópia dos valores usados. Dado novo =
 * nova versão (`supersedes`); antigo segue reproduzível (AC-007-06).
 */
export const analysisReports = pgTable(
  'analysis_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    adAccountId: text('ad_account_id').references(() => adAccounts.id, { onDelete: 'set null' }),
    filter: jsonb('filter').$type<ReportFilterLike>().notNull(),
    inputSnapshot: jsonb('input_snapshot').$type<ReportSnapshotLike>().notNull(),
    output: jsonb('output').$type<ReportOutputLike>().notNull(),
    modelId: text('model_id').notNull(),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms').notNull().default(0),
    version: integer('version').notNull().default(1),
    supersedes: uuid('supersedes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt,
  },
  (t) => [index('analysis_reports_client_idx').on(t.clientId)],
);

export const reportFeedbacks = pgTable('report_feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id')
    .notNull()
    .references(() => analysisReports.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  text: text('text').notNull(),
  createdAt,
});

/**
 * T-009-1: eventos de alerta com dedup (regra+entidade+janela). Mesmo
 * incidente = 1 linha `open`; retry não realerta. Ack/resolve humanos.
 */
export const alertEvents = pgTable(
  'alert_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rule: text('rule').notNull(),
    ruleVersion: text('rule_version').notNull(),
    adAccountId: text('ad_account_id').references(() => adAccounts.id, { onDelete: 'set null' }),
    entity: text('entity').notNull().default(''),
    fingerprint: text('fingerprint').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    state: text('state').notNull().default('open'),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [
    unique('alert_events_fingerprint_unique').on(t.fingerprint),
    index('alert_events_state_idx').on(t.state),
  ],
);

/**
 * T-008-1: aprendizado por marca/conta. Hipótese vira observação consistente
 * e depois teste controlado — só por registro humano, nunca automático.
 * Negativo/inconclusivo permanece.
 */
export const learnings = pgTable(
  'learnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    adAccountId: text('ad_account_id').references(() => adAccounts.id, { onDelete: 'set null' }),
    sourceReportId: uuid('source_report_id').references(() => analysisReports.id, { onDelete: 'set null' }),
    originVariantIds: uuid('origin_variant_ids').array().notNull().default(sql`'{}'::uuid[]`),
    hypothesis: text('hypothesis').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
    limitations: text('limitations').array().notNull().default(sql`'{}'::text[]`),
    evidenceLevel: text('evidence_level').notNull().default('hypothesis'),
    controlVariantId: uuid('control_variant_id').references(() => creativeVariants.id, { onDelete: 'set null' }),
    primaryMetric: text('primary_metric'),
    testConditions: text('test_conditions'),
    testBatchId: uuid('test_batch_id').references(() => batches.id, { onDelete: 'set null' }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    testDesign: text('test_design'),
    resultSummary: text('result_summary'),
    outcome: text('outcome'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt,
    updatedAt,
  },
  (t) => [index('learnings_client_idx').on(t.clientId)],
);

/**
 * T-002-1 (FR-002-02): variante de comunicação — composição imutável de
 * mídia + copy + destino. Mesmo conteúdo = mesma linha (fingerprint por
 * cliente). Nunca atualizada, só inserida ou reutilizada.
 */
export const creativeVariants = pgTable(
  'creative_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    manifest: jsonb('manifest').$type<VariantManifest>().notNull(),
    createdAt,
  },
  (t) => [
    unique('creative_variants_client_fp_unique').on(t.clientId, t.fingerprint),
    index('creative_variants_client_idx').on(t.clientId),
  ],
);

/**
 * T-002-2 (FR-002-03/05): vínculo observado entre anúncio Meta e variante.
 * Um ativo por item (`observed_to` nulo). `precision` diz o quanto o vínculo
 * prova: `confirmed` (publicado pelo app), `manual` (operador),
 * `ambiguous_intraday` (criativo trocado com métrica só diária),
 * `media_missing` (assets indisponíveis — sem descrever nada).
 */
export const adCreativeBindings = pgTable(
  'ad_creative_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adDraftId: uuid('ad_draft_id').references(() => adDrafts.id, { onDelete: 'cascade' }),
    adAccountId: text('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    metaAdId: text('meta_ad_id'),
    metaCreativeId: text('meta_creative_id'),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => creativeVariants.id, { onDelete: 'restrict' }),
    observedFrom: timestamp('observed_from', { withTimezone: true }).notNull().defaultNow(),
    observedTo: timestamp('observed_to', { withTimezone: true }),
    precision: text('precision').notNull().default('confirmed'),
    ambiguityReason: text('ambiguity_reason'),
    createdAt,
  },
  (t) => [
    index('ad_bindings_draft_idx').on(t.adDraftId),
    index('ad_bindings_meta_ad_idx').on(t.metaAdId),
  ],
);

/**
 * T-006-2: análise de conteúdo versionada. Correção humana = nova revisão;
 * original preservado via `superseded_by`. Cache por (asset, input_hash).
 */
export const contentAnalyses = pgTable(
  'content_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    assetSha: text('asset_sha').notNull(),
    promptVersion: text('prompt_version').notNull(),
    modelId: text('model_id').notNull(),
    schemaVersion: text('schema_version').notNull(),
    inputHash: text('input_hash').notNull(),
    findings: jsonb('findings').$type<ContentAnalysisLike>().notNull(),
    coverage: jsonb('coverage')
      .$type<{ observed: Array<[number, number]>; transcript: string }>()
      .notNull(),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms').notNull().default(0),
    revision: integer('revision').notNull().default(1),
    supersededBy: uuid('superseded_by'),
    createdAt,
  },
  (t) => [
    unique('content_analyses_asset_input_unique').on(t.assetId, t.inputHash),
    index('content_analyses_asset_idx').on(t.assetId),
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
    /**
     * Dono da criação em curso e validade da posse. Sem isso o item que morre
     * durante o create deixa a ref em `pending` para sempre e todos os outros
     * itens do lote esperam um dono que não existe mais.
     */
    claimOwner: text('claim_owner'),
    claimUntil: timestamp('claim_until', { withTimezone: true }),
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

/**
 * Escrita enviada à Meta e o desfecho que o app conseguiu observar.
 *
 * Resolve um caso que nenhum outro registro cobre: o processo morre entre o
 * POST e a persistência do ID. Quem retoma vê o mesmo estado de "morreu antes
 * de enviar" e recriaria o objeto — anúncio ou campanha duplicada na Meta.
 * `resolved_at IS NULL` significa exatamente "saiu do app e ninguém viu o
 * fim": retomar exige decisão humana. Erro observado em processo (timeout,
 * 5xx) já resolve a linha; a reconciliação continua sendo decidida pelo
 * caminho de erro ambíguo.
 */
export const metaWrites = pgTable(
  'meta_writes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `draft:<id>:<step>` ou `ref:<batch>:<refKey>` — o que a retomada sabe consultar. */
    writeKey: text('write_key').notNull(),
    method: text('method').notNull(),
    endpoint: text('endpoint').notNull(),
    adAccountId: text('ad_account_id'),
    adDraftId: uuid('ad_draft_id').references(() => adDrafts.id, { onDelete: 'cascade' }),
    outcome: text('outcome'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index('meta_writes_pending_idx')
      .on(t.writeKey)
      .where(sql`resolved_at is null`),
    index('meta_writes_draft_idx').on(t.adDraftId),
  ],
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
    createdAt,
  },
  (t) => [unique('ai_generations_cache_unique').on(t.purpose, t.promptVersion, t.inputHash)],
);

/**
 * A9: análise de mídia em job. A requisição confirma o recebimento e o
 * worker roda ffmpeg + IA longe do processo da API; o estado fica aqui para o
 * usuário acompanhar, recuperar o resultado e ver a falha.
 */
export const analysisJobs = pgTable(
  'analysis_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    status: analysisJobStatusEnum('status').notNull().default('queued'),
    brandContext: text('brand_context').notNull().default(''),
    force: boolean('force').notNull().default(false),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    analysisId: uuid('analysis_id').references(() => contentAnalyses.id, { onDelete: 'set null' }),
    error: text('error'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('analysis_jobs_asset_idx').on(t.assetId, t.status),
    index('analysis_jobs_status_idx').on(t.status, t.queuedAt),
  ],
);

/**
 * Importação do Drive observável: a requisição cria a linha `queued`, o worker
 * marca `running`/`done`/`failed`. Resultado agregado fica aqui para a tela
 * acompanhar sem depender do Redis (que descarta job concluído).
 */
export const driveImportJobs = pgTable(
  'drive_import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    folderUrl: text('folder_url').notNull(),
    recursive: boolean('recursive').notNull().default(true),
    status: driveImportStatusEnum('status').notNull().default('queued'),
    imported: integer('imported').notNull().default(0),
    reused: integer('reused').notNull().default(0),
    rejected: jsonb('rejected')
      .$type<Array<{ filename: string; reason: string }>>()
      .notNull()
      .default([]),
    error: text('error'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('drive_import_jobs_client_idx').on(t.clientId, t.status),
    index('drive_import_jobs_status_idx').on(t.status, t.queuedAt),
    // Uma pasta tem no máximo um job aberto: dois POSTs concorrentes não
    // importam a mesma pasta duas vezes — o segundo volta ao job vivo.
    // Parcial porque pasta com job encerrado (done/failed) pode reimportar.
    uniqueIndex('drive_import_jobs_open_unique')
      .on(t.clientId, t.folderUrl)
      .where(sql`status in ('queued', 'running')`),
  ],
);

/**
 * Cada tentativa que chegou ao provedor de IA, com tokens e custo estimado.
 * É a fonte do custo operacional: `ai_generations` guarda o resultado
 * reutilizável (cache), não a conta — duas chamadas iguais pagas aparecem
 * aqui, mas só a última fica no cache.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    purpose: text('purpose').notNull(),
    model: text('model').notNull(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    status: text('status').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheCreationTokens: integer('cache_creation_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms').notNull().default(0),
    error: text('error'),
    createdAt,
  },
  (t) => [
    index('ai_usage_created_idx').on(t.createdAt),
    index('ai_usage_purpose_idx').on(t.purpose, t.createdAt),
  ],
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

/**
 * Autorização OAuth 2.1 do servidor MCP (apps/mcp): registro dinâmico de
 * clientes, códigos com PKCE e tokens opacos guardados só como hash. São
 * tabelas do app MCP — a API não lê nem escreve aqui.
 */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientName: text('client_name').notNull().default(''),
  redirectUris: text('redirect_uris').array().notNull(),
  grantTypes: text('grant_types').array().notNull(),
  responseTypes: text('response_types').array().notNull(),
  scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
  tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull().default('none'),
  registeredAt: createdAt,
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export const oauthAuthorizationCodes = pgTable(
  'oauth_authorization_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    resource: text('resource'),
    /** Uso único: `consumed_at` marca a troca e barra replay do código. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt,
  },
  (t) => [index('oauth_codes_expires_idx').on(t.expiresAt)],
);

export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Corrente de rotações do mesmo consentimento. */
    familyId: uuid('family_id').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessTokenHash: text('access_token_hash').notNull().unique(),
    refreshTokenHash: text('refresh_token_hash').unique(),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    resource: text('resource'),
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index('oauth_tokens_family_idx').on(t.familyId),
    index('oauth_tokens_user_idx').on(t.userId),
    index('oauth_tokens_access_expires_idx').on(t.accessExpiresAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type OAuthClientRow = typeof oauthClients.$inferSelect;
export type OAuthAuthorizationCodeRow = typeof oauthAuthorizationCodes.$inferSelect;
export type OAuthTokenRow = typeof oauthTokens.$inferSelect;
export type MetaConnectionRow = typeof metaConnections.$inferSelect;
export type ClientRow = typeof clients.$inferSelect;
export type WhatsappAccountRow = typeof whatsappAccounts.$inferSelect;
export type AdAccountRow = typeof adAccounts.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type AssetUploadRow = typeof assetUploads.$inferSelect;
export type BatchRow = typeof batches.$inferSelect;
export type AdDraftRow = typeof adDrafts.$inferSelect;
export type BatchRefRow = typeof batchRefs.$inferSelect;
export type PublishJobRow = typeof publishJobs.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type AiGenerationRow = typeof aiGenerations.$inferSelect;
export type AiUsageRow = typeof aiUsage.$inferSelect;
export type AnalysisJobRow = typeof analysisJobs.$inferSelect;
export type DriveImportJobRow = typeof driveImportJobs.$inferSelect;
export type CampaignCacheRow = typeof campaignsCache.$inferSelect;
export type AdsetCacheRow = typeof adsetsCache.$inferSelect;
