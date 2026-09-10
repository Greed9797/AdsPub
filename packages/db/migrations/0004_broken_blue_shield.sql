CREATE TABLE "ad_creative_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_draft_id" uuid,
	"ad_account_id" text NOT NULL,
	"meta_ad_id" text,
	"meta_creative_id" text,
	"variant_id" uuid NOT NULL,
	"observed_from" timestamp with time zone DEFAULT now() NOT NULL,
	"observed_to" timestamp with time zone,
	"precision" text DEFAULT 'confirmed' NOT NULL,
	"ambiguity_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_variants_client_fp_unique" UNIQUE("client_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "ad_drafts" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "ad_creative_bindings" ADD CONSTRAINT "ad_creative_bindings_ad_draft_id_ad_drafts_id_fk" FOREIGN KEY ("ad_draft_id") REFERENCES "public"."ad_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creative_bindings" ADD CONSTRAINT "ad_creative_bindings_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creative_bindings" ADD CONSTRAINT "ad_creative_bindings_variant_id_creative_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."creative_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_variants" ADD CONSTRAINT "creative_variants_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_bindings_draft_idx" ON "ad_creative_bindings" USING btree ("ad_draft_id");--> statement-breakpoint
CREATE INDEX "ad_bindings_meta_ad_idx" ON "ad_creative_bindings" USING btree ("meta_ad_id");--> statement-breakpoint
CREATE INDEX "creative_variants_client_idx" ON "creative_variants" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_variant_id_creative_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."creative_variants"("id") ON DELETE set null ON UPDATE no action;