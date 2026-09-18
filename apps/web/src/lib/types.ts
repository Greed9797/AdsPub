/** Espelho tipado dos DTOs da API (apps/api/src/lib/dto.ts). */

export type Role = 'admin' | 'coordinator' | 'manager' | 'viewer';

export interface Connection {
  id: string;
  business_id: string;
  label: string;
  api_tier: 'limited' | 'full' | 'unknown';
  status: 'active' | 'needs_attention' | 'revoked';
  scopes: string[];
  token_expires_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
}

export interface AdAccount {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  client_id: string | null;
  connection_id: string | null;
  default_page_id: string | null;
  default_ig_user_id: string | null;
  default_pixel_id: string | null;
  daily_ad_cap: number | null;
  rate_usage: Record<string, unknown>;
  paused_until: string | null;
  last_synced_at: string | null;
  ads_manager_url: string;
}

export interface VoiceProfile {
  tone: string;
  audience: string;
  forbidden_terms: string[];
  allowed_claims: string[];
  examples: string[];
}

export interface Client {
  id: string;
  name: string;
  voice_profile: VoiceProfile;
  naming_template: string;
  default_utm: Record<string, string>;
  policy_mode: 'warn' | 'block';
  landing_domains: string[];
  advantage_creative_optout: boolean;
}

export interface Asset {
  id: string;
  client_id: string;
  kind: 'image' | 'video';
  filename: string;
  mime: string;
  sha256: string;
  width: number;
  height: number;
  aspect_ratio: string;
  duration_ms: number | null;
  size_bytes: number;
  source: 'upload' | 'drive';
  /** Frases prontas da validação de mídia (T-002-1): já vêm com o próximo passo. */
  validation: { status: 'ok' | 'rejected'; errors: string[]; warnings: string[] };
  thumbnail_url: string | null;
  /** Link assinado do arquivo original (o player de vídeo usa este). */
  url: string | null;
  created_at: string;
}

/** T-002-3: variante de comunicação (composição imutável). */
export interface Variant {
  id: string;
  client_id: string;
  fingerprint: string;
  manifest: {
    format: string;
    assetIds: string[];
    copy: Copy;
    pageId: string;
    igUserId: string | null;
    offerContext: string | null;
  };
  created_at: string | null;
}

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
  fix: string;
}

export interface PolicyIssue {
  category: string;
  excerpt: string;
  severity: 'info' | 'warning' | 'error';
  source?: string;
}

export interface Copy {
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  link: string;
  url_tags: string;
}

export type ObjectRef = { kind: 'existing'; id: string } | { kind: 'new'; key: string };

export type AdDraftStatus =
  | 'draft'
  | 'blocked'
  | 'ready'
  | 'queued'
  | 'uploading_media'
  | 'ensuring_campaign'
  | 'ensuring_adset'
  | 'creating_creative'
  | 'creating_ad'
  | 'published'
  | 'in_review'
  | 'approved'
  | 'disapproved'
  | 'failed'
  | 'needs_reconciliation';

export interface AdDraft {
  id: string;
  position: number;
  format: 'single_image' | 'single_video' | 'carousel';
  asset_ids: string[];
  copy: Copy;
  name: string;
  campaign_ref: ObjectRef;
  adset_ref: ObjectRef;
  page_id: string;
  ig_user_id: string | null;
  status: AdDraftStatus;
  step: string | null;
  validation: {
    status: 'ready' | 'blocked';
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    policy: PolicyIssue[];
    suggested_name?: string;
  } | null;
  meta_ids: Record<string, string> | null;
  effective_status: string | null;
  review_feedback: unknown;
  error: { code: string; message: string; fix?: string; transient?: boolean } | null;
  attempts: number;
  edited_fields: string[];
  version: number;
  published_at: string | null;
  ads_manager_url: string | null;
}

export type BatchStatus =
  | 'draft'
  | 'ready'
  | 'blocked'
  | 'queued'
  | 'publishing'
  | 'done'
  | 'partial'
  | 'failed'
  | 'archived';

export interface Batch {
  id: string;
  name: string;
  client_id: string;
  ad_account_id: string;
  created_by: string | null;
  mode: 'ai' | 'manual';
  briefing: string | null;
  status: BatchStatus;
  options: Record<string, unknown>;
  version: number;
  duplicated_from: string | null;
  pending: string[];
  plan_notes: string;
  items: AdDraft[];
  /** Só o detalhe do lote devolve as refs compartilhadas e a aprovação. */
  refs?: BatchRef[];
  /**
   * `approved` é a validação ainda válida para o conteúdo atual: qualquer
   * edição derruba a aprovação e a publicação exige revalidar.
   */
  approval?: { approved: boolean; validated_at: string | null };
  created_at: string;
  updated_at: string;
}

/**
 * Campanha/conjunto compartilhado pelos itens do lote. `needs_reconciliation`
 * é o create que pode ter acontecido na Meta sem resposta: ninguém recria até
 * alguém conferir.
 */
export interface BatchRef {
  ref_key: string;
  kind: 'campaign' | 'adset';
  state: 'pending' | 'created' | 'failed' | 'needs_reconciliation';
  meta_id: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface ValidationReport {
  can_publish: boolean;
  items: Array<{
    item_id: string;
    status: 'ready' | 'blocked';
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    policy: PolicyIssue[];
    suggested_name?: string;
  }>;
}

export interface PublishResult {
  batch_id: string;
  queued: number;
  skipped: number;
  jobs: Array<{ job_id: string; queue: string }>;
  daily_remaining: number;
}

export interface AccountHealth {
  ad_account_id: string;
  name: string;
  connection_status: string;
  rate_usage: Record<string, unknown>;
  paused_until: string | null;
  published_today: number;
  daily_cap: number;
  pending_jobs: number;
  error_rate_1h: number;
  p95_latency_ms: number;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

export interface CampaignRef {
  id: string;
  name: string;
  objective: string;
  status: string;
  effective_status: string;
  special_ad_categories: unknown;
}

export interface AdsetRef {
  id: string;
  name: string;
  campaign_id: string | null;
  status: string;
  effective_status: string;
  optimization_goal: string;
  billing_event: unknown;
  destination_type: unknown;
  promoted_object: unknown;
}
