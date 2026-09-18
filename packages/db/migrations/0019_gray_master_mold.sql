CREATE TABLE "meta_writes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"write_key" text NOT NULL,
	"method" text NOT NULL,
	"endpoint" text NOT NULL,
	"ad_account_id" text,
	"ad_draft_id" uuid,
	"outcome" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_writes" ADD CONSTRAINT "meta_writes_ad_draft_id_ad_drafts_id_fk" FOREIGN KEY ("ad_draft_id") REFERENCES "public"."ad_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_writes_pending_idx" ON "meta_writes" USING btree ("write_key") WHERE resolved_at is null;--> statement-breakpoint
CREATE INDEX "meta_writes_draft_idx" ON "meta_writes" USING btree ("ad_draft_id");