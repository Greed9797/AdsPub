ALTER TABLE "clients" ADD COLUMN "metric_policy" jsonb;--> statement-breakpoint
ALTER TABLE "metric_observations" ADD COLUMN "currency" text DEFAULT 'unknown' NOT NULL;