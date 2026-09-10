CREATE TABLE "metric_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"ad_account_id" text,
	"import_id" uuid NOT NULL,
	"local_row_id" text NOT NULL,
	"ad_id" text,
	"ad_name" text DEFAULT '' NOT NULL,
	"entity_level" text NOT NULL,
	"date_start" date NOT NULL,
	"date_stop" date NOT NULL,
	"grain" text NOT NULL,
	"attribution" text DEFAULT 'unknown' NOT NULL,
	"coverage" text DEFAULT 'unknown' NOT NULL,
	"breakdown_signature" text DEFAULT '' NOT NULL,
	"metric_definition_version" text DEFAULT 'v1' NOT NULL,
	"metrics" jsonb NOT NULL,
	"source" text DEFAULT 'file' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_observations_import_row_unique" UNIQUE("import_id","local_row_id")
);
--> statement-breakpoint
CREATE TABLE "report_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"ad_account_id" text,
	"filename" text NOT NULL,
	"mime" text DEFAULT 'text/csv' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"context" jsonb NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mapping_version" text DEFAULT 'v1' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"mapped" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "report_rows_import_row_unique" UNIQUE("import_id","row_number")
);
--> statement-breakpoint
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_import_id_report_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."report_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_imports" ADD CONSTRAINT "report_imports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_imports" ADD CONSTRAINT "report_imports_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_imports" ADD CONSTRAINT "report_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_rows" ADD CONSTRAINT "report_rows_import_id_report_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."report_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "metric_observations_client_idx" ON "metric_observations" USING btree ("client_id","ad_id");--> statement-breakpoint
CREATE INDEX "report_imports_client_idx" ON "report_imports" USING btree ("client_id");