CREATE TABLE "content_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"asset_sha" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"findings" jsonb NOT NULL,
	"coverage" jsonb NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_analyses_asset_input_unique" UNIQUE("asset_id","input_hash")
);
--> statement-breakpoint
ALTER TABLE "content_analyses" ADD CONSTRAINT "content_analyses_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_analyses_asset_idx" ON "content_analyses" USING btree ("asset_id");