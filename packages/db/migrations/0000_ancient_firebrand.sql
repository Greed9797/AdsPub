CREATE TYPE "public"."ad_draft_status" AS ENUM('draft', 'blocked', 'ready', 'queued', 'uploading_media', 'ensuring_campaign', 'ensuring_adset', 'creating_creative', 'creating_ad', 'published', 'in_review', 'approved', 'disapproved', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ad_format" AS ENUM('single_image', 'single_video', 'carousel');--> statement-breakpoint
CREATE TYPE "public"."ai_feedback" AS ENUM('used', 'edited', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ai_purpose" AS ENUM('plan', 'copy', 'policy');--> statement-breakpoint
CREATE TYPE "public"."api_tier" AS ENUM('limited', 'full', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."asset_source" AS ENUM('drive', 'upload');--> statement-breakpoint
CREATE TYPE "public"."batch_mode" AS ENUM('ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('draft', 'ready', 'blocked', 'queued', 'publishing', 'done', 'partial', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'needs_attention', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('waiting', 'active', 'delayed', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."policy_mode" AS ENUM('warn', 'block');--> statement-breakpoint
CREATE TYPE "public"."publish_step" AS ENUM('upload_media', 'ensure_campaign', 'ensure_adset', 'create_creative', 'create_ad', 'done');--> statement-breakpoint
CREATE TYPE "public"."ref_kind" AS ENUM('campaign', 'adset');--> statement-breakpoint
CREATE TYPE "public"."ref_state" AS ENUM('pending', 'created', 'failed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'coordinator', 'manager', 'viewer');--> statement-breakpoint
CREATE TABLE "account_pages" (
	"ad_account_id" text NOT NULL,
	"page_id" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_pages_ad_account_id_page_id_pk" PRIMARY KEY("ad_account_id","page_id")
);
--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT '' NOT NULL,
	"timezone_name" text DEFAULT '' NOT NULL,
	"account_status" integer DEFAULT 0 NOT NULL,
	"default_page_id" text,
	"default_ig_user_id" text,
	"default_pixel_id" text,
	"daily_ad_cap" integer DEFAULT 100 NOT NULL,
	"active_ads_count" integer DEFAULT 0 NOT NULL,
	"rate_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paused_until" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"campaign_ref" jsonb NOT NULL,
	"adset_ref" jsonb NOT NULL,
	"format" "ad_format" NOT NULL,
	"asset_ids" uuid[] NOT NULL,
	"copy" jsonb NOT NULL,
	"name" text NOT NULL,
	"page_id" text DEFAULT '' NOT NULL,
	"ig_user_id" text,
	"status" "ad_draft_status" DEFAULT 'draft' NOT NULL,
	"step" "publish_step" DEFAULT 'upload_media' NOT NULL,
	"validation" jsonb,
	"meta_ids" jsonb NOT NULL,
	"effective_status" text,
	"review_feedback" jsonb,
	"error" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"edited_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_drafts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ad_drafts_batch_position_unique" UNIQUE("batch_id","position")
);
--> statement-breakpoint
CREATE TABLE "adsets_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_account_id" text NOT NULL,
	"campaign_id" text,
	"name" text DEFAULT '' NOT NULL,
	"optimization_goal" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"effective_status" text DEFAULT '' NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid,
	"purpose" "ai_purpose" NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_hash" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"feedback" "ai_feedback",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_generations_cache_unique" UNIQUE("purpose","prompt_version","input_hash")
);
--> statement-breakpoint
CREATE TABLE "asset_uploads" (
	"asset_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"meta_image_hash" text,
	"meta_video_id" text,
	"video_status" text,
	"thumbnail_hash" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_uploads_asset_id_ad_account_id_pk" PRIMARY KEY("asset_id","ad_account_id")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"aspect_ratio" text DEFAULT 'other' NOT NULL,
	"duration_ms" integer,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"source" "asset_source" NOT NULL,
	"drive_file_id" text,
	"validation" jsonb NOT NULL,
	"thumbnail_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_client_sha_unique" UNIQUE("client_id","sha256")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"meta_request" jsonb,
	"meta_response" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_refs" (
	"batch_id" uuid NOT NULL,
	"ref_key" text NOT NULL,
	"kind" "ref_kind" NOT NULL,
	"meta_id" text,
	"state" "ref_state" DEFAULT 'pending' NOT NULL,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_refs_batch_id_ref_key_pk" PRIMARY KEY("batch_id","ref_key")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"briefing" text,
	"mode" "batch_mode" NOT NULL,
	"plan" jsonb,
	"status" "batch_status" DEFAULT 'draft' NOT NULL,
	"options" jsonb NOT NULL,
	"duplicated_from" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_account_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"effective_status" text DEFAULT '' NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"voice_profile" jsonb NOT NULL,
	"naming_template" text DEFAULT '{cliente}_{objetivo}_{data:YYYYMMDD}_{criativo}_{formato}_{v}' NOT NULL,
	"default_utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_mode" "policy_mode" DEFAULT 'warn' NOT NULL,
	"landing_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"advantage_creative_optout" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"page_id" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_api_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ad_account_id" text,
	"ad_draft_id" uuid,
	"method" text NOT NULL,
	"endpoint" text NOT NULL,
	"api_version" text NOT NULL,
	"status_code" integer DEFAULT 0 NOT NULL,
	"error_code" integer,
	"error_subcode" integer,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" text NOT NULL,
	"label" text NOT NULL,
	"token_ciphertext" "bytea" NOT NULL,
	"token_iv" "bytea" NOT NULL,
	"token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"api_tier" "api_tier" DEFAULT 'unknown' NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"instagram_user_id" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pixels" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_account_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_draft_id" uuid NOT NULL,
	"queue" text NOT NULL,
	"bull_job_id" text,
	"step" "publish_step" NOT NULL,
	"state" "job_state" DEFAULT 'waiting' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ad_accounts" (
	"user_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_ad_accounts_user_id_ad_account_id_pk" PRIMARY KEY("user_id","ad_account_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" "role" DEFAULT 'manager' NOT NULL,
	"google_sub" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account_pages" ADD CONSTRAINT "account_pages_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adsets_cache" ADD CONSTRAINT "adsets_cache_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_uploads" ADD CONSTRAINT "asset_uploads_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_uploads" ADD CONSTRAINT "asset_uploads_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_refs" ADD CONSTRAINT "batch_refs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns_cache" ADD CONSTRAINT "campaigns_cache_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixels" ADD CONSTRAINT "pixels_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_ad_draft_id_ad_drafts_id_fk" FOREIGN KEY ("ad_draft_id") REFERENCES "public"."ad_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ad_accounts" ADD CONSTRAINT "user_ad_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ad_accounts" ADD CONSTRAINT "user_ad_accounts_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_accounts_client_idx" ON "ad_accounts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ad_drafts_status_idx" ON "ad_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "adsets_cache_account_idx" ON "adsets_cache" USING btree ("ad_account_id","campaign_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "batches_account_idx" ON "batches" USING btree ("ad_account_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_cache_account_idx" ON "campaigns_cache" USING btree ("ad_account_id");--> statement-breakpoint
CREATE INDEX "meta_api_calls_account_idx" ON "meta_api_calls" USING btree ("ad_account_id","created_at");--> statement-breakpoint
CREATE INDEX "publish_jobs_draft_idx" ON "publish_jobs" USING btree ("ad_draft_id");