CREATE TABLE "account_sync_state" (
	"ad_account_id" text PRIMARY KEY NOT NULL,
	"last_daily_covered" date,
	"moving_window_start" date,
	"moving_window_end" date,
	"pending_report_run_id" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"ad_account_id" text,
	"fingerprint" text NOT NULL,
	"level" text NOT NULL,
	"fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"date_start" date NOT NULL,
	"date_stop" date NOT NULL,
	"grain" text DEFAULT 'daily' NOT NULL,
	"attribution" text DEFAULT 'unknown' NOT NULL,
	"breakdown_signature" text DEFAULT '' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completeness" text DEFAULT 'complete' NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"source_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insight_snapshots_client_fp_unique" UNIQUE("client_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "metric_observations" ALTER COLUMN "import_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "metric_observations" ADD COLUMN "snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "account_sync_state" ADD CONSTRAINT "account_sync_state_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_snapshots" ADD CONSTRAINT "insight_snapshots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_snapshots" ADD CONSTRAINT "insight_snapshots_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insight_snapshots_account_idx" ON "insight_snapshots" USING btree ("ad_account_id");--> statement-breakpoint
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_snapshot_id_insight_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."insight_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_canonical_unique" UNIQUE("client_id","source","local_row_id");