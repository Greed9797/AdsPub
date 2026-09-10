import { z } from 'zod';
import {
  adFormatSchema,
  billingEventSchema,
  ctaSchema,
  objectiveSchema,
  optimizationGoalSchema,
  policyModeSchema,
  roleSchema,
} from './enums.js';

export const carouselCardSchema = z.object({
  asset_id: z.string().uuid(),
  headline: z.string().max(255).default(''),
  description: z.string().max(255).default(''),
  link: z.string().default(''),
});
export type CarouselCard = z.infer<typeof carouselCardSchema>;

/**
 * Copy de um anúncio. `link` vazio significa "pendente" — a IA nunca inventa URL
 * (spec US3 cenário 4); a validação bloqueia o item.
 */
export const copySchema = z.object({
  primary_text: z.string().min(1).max(2000),
  headline: z.string().max(255).default(''),
  description: z.string().max(255).default(''),
  cta: ctaSchema,
  link: z.string().default(''),
  display_link: z.string().default(''),
  url_tags: z.string().default(''),
  cards: z.array(carouselCardSchema).max(10).optional(),
});
export type Copy = z.infer<typeof copySchema>;

export const campaignSpecSchema = z.object({
  name: z.string().min(1),
  objective: objectiveSchema,
  buying_type: z.literal('AUCTION').default('AUCTION'),
  daily_budget_cents: z.number().int().positive().optional(),
  lifetime_budget_cents: z.number().int().positive().optional(),
  special_ad_categories: z.array(z.string()).default([]),
});
export type CampaignSpec = z.infer<typeof campaignSpecSchema>;

export const adsetSpecSchema = z.object({
  name: z.string().min(1),
  optimization_goal: optimizationGoalSchema,
  billing_event: billingEventSchema,
  /** R10: público explícito OU advantage_audience. */
  advantage_audience: z.boolean().default(true),
  targeting: z.record(z.string(), z.unknown()).optional(),
  daily_budget_cents: z.number().int().positive().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  promoted_object: z.record(z.string(), z.unknown()).optional(),
  campaign_key: z.string().optional(),
});
export type AdsetSpec = z.infer<typeof adsetSpecSchema>;

const existingRef = z.object({ kind: z.literal('existing'), id: z.string().min(1) });
const newRef = z.object({ kind: z.literal('new'), key: z.string().min(1) });

export const objectRefSchema = z.discriminatedUnion('kind', [existingRef, newRef]);
export type ObjectRef = z.infer<typeof objectRefSchema>;

/** Item do plano: 1 criativo (ou N cartões) × N variações de copy. */
export const planItemSchema = z.object({
  format: adFormatSchema,
  asset_ids: z.array(z.string().uuid()).min(1).max(10),
  campaign_ref: objectRefSchema,
  adset_ref: objectRefSchema,
  copies: z.array(copySchema).min(1).max(5),
  page_id: z.string().optional(),
  ig_user_id: z.string().nullable().optional(),
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const pendingFieldSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
  item_index: z.number().int().nonnegative().optional(),
});
export type PendingField = z.infer<typeof pendingFieldSchema>;

/** Artefato único produzido pelo modo IA e pelo modo formulário (FR-006/FR-008). */
export const batchPlanSchema = z.object({
  campaigns: z.array(campaignSpecSchema.extend({ key: z.string().min(1) })).default([]),
  adsets: z.array(adsetSpecSchema.extend({ key: z.string().min(1) })).default([]),
  items: z.array(planItemSchema).min(1),
  pending: z.array(pendingFieldSchema).default([]),
  notes: z.string().default(''),
});
export type BatchPlan = z.infer<typeof batchPlanSchema>;

/**
 * Um item persistido (ad_drafts) — uma copy só.
 * `name` e `page_id` chegam vazios quando vêm do plano/formulário: o
 * preenchimento automático (naming template, página padrão da conta) roda em
 * `applyAutoFields` e a ausência é reportada pelo validador, não pelo schema.
 */
export const adDraftInputSchema = z.object({
  format: adFormatSchema,
  asset_ids: z.array(z.string().uuid()).min(1).max(10),
  copy: copySchema,
  name: z.string().default(''),
  campaign_ref: objectRefSchema,
  adset_ref: objectRefSchema,
  page_id: z.string().default(''),
  ig_user_id: z.string().nullable().default(null),
  version: z.number().int().nonnegative().optional(),
});
export type AdDraftInput = z.infer<typeof adDraftInputSchema>;

export const validationIssueSchema = z.object({
  code: z.string(),
  field: z.string(),
  message: z.string(),
  fix: z.string().default(''),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const policyIssueSchema = z.object({
  category: z.string(),
  excerpt: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  source: z.enum(['rules', 'ai']).default('rules'),
});
export type PolicyIssue = z.infer<typeof policyIssueSchema>;

export const itemValidationSchema = z.object({
  errors: z.array(validationIssueSchema).default([]),
  warnings: z.array(validationIssueSchema).default([]),
  policy: z.array(policyIssueSchema).default([]),
  suggested_name: z.string().optional(),
});
export type ItemValidation = z.infer<typeof itemValidationSchema>;

export const validationReportSchema = z.object({
  can_publish: z.boolean(),
  items: z.array(
    z.object({
      item_id: z.string(),
      status: z.enum(['ready', 'blocked']),
      errors: z.array(validationIssueSchema),
      warnings: z.array(validationIssueSchema),
      policy: z.array(policyIssueSchema),
      suggested_name: z.string().optional(),
    }),
  ),
});
export type ValidationReport = z.infer<typeof validationReportSchema>;

export const metaIdsSchema = z.object({  campaign_id: z.string().optional(),
  adset_id: z.string().optional(),
  creative_id: z.string().optional(),
  ad_id: z.string().optional(),
  image_hashes: z.record(z.string(), z.string()).default({}),
  video_ids: z.record(z.string(), z.string()).default({}),
  thumbnail_hashes: z.record(z.string(), z.string()).default({}),
});
export type MetaIds = z.infer<typeof metaIdsSchema>;

export const draftErrorSchema = z.object({
  code: z.number().optional(),
  subcode: z.number().optional(),
  message: z.string(),
  translated: z.string(),
  action: z.string().default(''),
  step: z.string().optional(),
});
export type DraftError = z.infer<typeof draftErrorSchema>;

/**
 * T-002-1 (FR-002-02): manifesto imutável da variante de comunicação. Nome do
 * anúncio/item fica de fora de propósito: nome é rótulo, não identidade
 * (AC-002-03). Mídias em ordem: carrossel reordenado é outra variante.
 */
export const variantManifestSchema = z.object({
  format: adFormatSchema,
  assetIds: z.array(z.string().uuid()),
  copy: copySchema,
  pageId: z.string().default(''),
  igUserId: z.string().nullable().default(null),
  offerContext: z.string().nullable().default(null),
});
export type VariantManifest = z.infer<typeof variantManifestSchema>;

export const bindingPrecisionSchema = z.enum(['confirmed', 'manual', 'ambiguous_intraday', 'media_missing']);
export type BindingPrecision = z.infer<typeof bindingPrecisionSchema>;

export const voiceProfileSchema = z.object({
  tone: z.string().default(''),
  audience: z.string().default(''),
  forbidden_terms: z.array(z.string()).default([]),
  allowed_claims: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
});
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const clientInputSchema = z.object({
  name: z.string().min(1),
  voice_profile: voiceProfileSchema.default({
    tone: '',
    audience: '',
    forbidden_terms: [],
    allowed_claims: [],
    examples: [],
  }),
  naming_template: z
    .string()
    .default('{cliente}_{objetivo}_{data:YYYYMMDD}_{criativo}_{formato}_{v}'),
  default_utm: z.record(z.string(), z.string()).default({}),
  policy_mode: policyModeSchema.default('warn'),
  landing_domains: z.array(z.string()).default([]),
  advantage_creative_optout: z.boolean().default(true),
});
export type ClientInput = z.infer<typeof clientInputSchema>;

export const adAccountDefaultsSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  default_page_id: z.string().nullable().optional(),
  default_ig_user_id: z.string().nullable().optional(),
  default_pixel_id: z.string().nullable().optional(),
  daily_ad_cap: z.number().int().positive().max(10_000).optional(),
});
export type AdAccountDefaults = z.infer<typeof adAccountDefaultsSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().default(''),
  role: roleSchema,
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const batchOptionsSchema = z.object({
  initial_status: z.literal('PAUSED').default('PAUSED'),
  max_items: z.number().int().positive().default(200),
  dry_run: z.boolean().default(false),
});
export type BatchOptions = z.infer<typeof batchOptionsSchema>;
