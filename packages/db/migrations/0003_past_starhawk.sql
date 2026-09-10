ALTER TABLE "ad_drafts" ADD COLUMN "validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_drafts" ADD COLUMN "queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_drafts" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "approval_fingerprint" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "validated_at" timestamp with time zone;