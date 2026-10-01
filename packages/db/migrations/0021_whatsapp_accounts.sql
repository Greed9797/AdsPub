CREATE TABLE "whatsapp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"display_phone" text DEFAULT '' NOT NULL,
	"token_ciphertext" bytea NOT NULL,
	"token_iv" bytea NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_accounts_waba_phone_unique" ON "whatsapp_accounts" USING btree ("waba_id","phone_number_id");
--> statement-breakpoint
CREATE INDEX "whatsapp_accounts_client_idx" ON "whatsapp_accounts" USING btree ("client_id");
