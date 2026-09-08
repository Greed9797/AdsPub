ALTER TABLE "ad_drafts" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "ad_drafts" ADD COLUMN "lease_until" timestamp with time zone;