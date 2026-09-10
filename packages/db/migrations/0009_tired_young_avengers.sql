CREATE TABLE "analysis_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"ad_account_id" text,
	"filter" jsonb NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"actor_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "source_report_id" uuid;--> statement-breakpoint
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_feedbacks" ADD CONSTRAINT "report_feedbacks_report_id_analysis_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."analysis_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_feedbacks" ADD CONSTRAINT "report_feedbacks_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_reports_client_idx" ON "analysis_reports" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_source_report_id_analysis_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."analysis_reports"("id") ON DELETE set null ON UPDATE no action;