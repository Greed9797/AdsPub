CREATE TABLE "learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"ad_account_id" text,
	"source_report_id" uuid,
	"origin_variant_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"hypothesis" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limitations" text[] DEFAULT '{}'::text[] NOT NULL,
	"evidence_level" text DEFAULT 'hypothesis' NOT NULL,
	"control_variant_id" uuid,
	"primary_metric" text,
	"test_conditions" text,
	"test_batch_id" uuid,
	"activated_at" timestamp with time zone,
	"test_design" text,
	"result_summary" text,
	"outcome" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_source_report_id_analysis_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."analysis_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_control_variant_id_creative_variants_id_fk" FOREIGN KEY ("control_variant_id") REFERENCES "public"."creative_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_test_batch_id_batches_id_fk" FOREIGN KEY ("test_batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learnings_client_idx" ON "learnings" USING btree ("client_id");