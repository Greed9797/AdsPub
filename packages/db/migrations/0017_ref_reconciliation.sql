ALTER TYPE "ref_state" ADD VALUE IF NOT EXISTS 'needs_reconciliation';--> statement-breakpoint
ALTER TABLE "batch_refs" ADD COLUMN IF NOT EXISTS "claim_owner" text;--> statement-breakpoint
ALTER TABLE "batch_refs" ADD COLUMN IF NOT EXISTS "claim_until" timestamp with time zone;
