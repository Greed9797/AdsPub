CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule" text NOT NULL,
	"rule_version" text NOT NULL,
	"ad_account_id" text,
	"entity" text DEFAULT '' NOT NULL,
	"fingerprint" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_events_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_events_state_idx" ON "alert_events" USING btree ("state");