import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'coordinator', 'manager', 'viewer']);
export type Role = z.infer<typeof roleSchema>;

export const apiTierSchema = z.enum(['limited', 'full', 'unknown']);
export type ApiTier = z.infer<typeof apiTierSchema>;

export const connectionStatusSchema = z.enum(['active', 'needs_attention', 'revoked']);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const batchModeSchema = z.enum(['ai', 'manual']);
export type BatchMode = z.infer<typeof batchModeSchema>;

export const batchStatusSchema = z.enum([
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
export type BatchStatus = z.infer<typeof batchStatusSchema>;

export const adDraftStatusSchema = z.enum([
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
export type AdDraftStatus = z.infer<typeof adDraftStatusSchema>;

export const publishStepSchema = z.enum([
  'upload_media',
  'ensure_campaign',
  'ensure_adset',
  'create_creative',
  'create_ad',
  'done',
]);
export type PublishStep = z.infer<typeof publishStepSchema>;

export const adFormatSchema = z.enum(['single_image', 'single_video', 'carousel']);
export type AdFormat = z.infer<typeof adFormatSchema>;

export const assetKindSchema = z.enum(['image', 'video']);
export type AssetKind = z.infer<typeof assetKindSchema>;

/** FR-020 / R10: apenas objetivos OUTCOME_*, nunca ASC/AAC legados. */
export const objectiveSchema = z.enum([
  'OUTCOME_SALES',
  'OUTCOME_LEADS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_ENGAGEMENT',
]);
export type Objective = z.infer<typeof objectiveSchema>;

export const LEGACY_CAMPAIGN_TYPES = [
  'SHOPPING',
  'APP_INSTALL',
  'CONVERSIONS',
  'LINK_CLICKS',
  'POST_ENGAGEMENT',
  'LEAD_GENERATION',
  'SMART_PROMOTION_TYPE',
  'AUTOMATED_SHOPPING_ADS',
  'APP_ADVERTISING',
] as const;

export const optimizationGoalSchema = z.enum([
  'OFFSITE_CONVERSIONS',
  'LINK_CLICKS',
  'LANDING_PAGE_VIEWS',
  'LEAD_GENERATION',
  'QUALITY_LEAD',
  'POST_ENGAGEMENT',
  'REACH',
  'THRUPLAY',
  'VALUE',
]);
export type OptimizationGoal = z.infer<typeof optimizationGoalSchema>;

export const billingEventSchema = z.enum(['IMPRESSIONS', 'LINK_CLICKS', 'THRUPLAY']);
export type BillingEvent = z.infer<typeof billingEventSchema>;

export const ctaSchema = z.enum([
  'SHOP_NOW',
  'LEARN_MORE',
  'SIGN_UP',
  'SUBSCRIBE',
  'DOWNLOAD',
  'GET_OFFER',
  'GET_QUOTE',
  'CONTACT_US',
  'APPLY_NOW',
  'BOOK_TRAVEL',
  'ORDER_NOW',
  'SEND_MESSAGE',
  'WHATSAPP_MESSAGE',
  'SEE_MENU',
  'DONATE_NOW',
  'NO_BUTTON',
]);
export type Cta = z.infer<typeof ctaSchema>;

export const policyModeSchema = z.enum(['warn', 'block']);
export type PolicyMode = z.infer<typeof policyModeSchema>;

export const assetSourceSchema = z.enum(['drive', 'upload']);
export type AssetSource = z.infer<typeof assetSourceSchema>;

export const aiPurposeSchema = z.enum(['plan', 'copy', 'policy']);
export type AiPurpose = z.infer<typeof aiPurposeSchema>;

export const queueNameSchema = z.enum([
  'import-drive',
  'media-upload',
  'publish',
  'sync',
  'status-poll',
]);
export type QueueName = z.infer<typeof queueNameSchema>;
