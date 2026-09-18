CREATE TYPE "public"."drive_import_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "drive_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"folder_url" text NOT NULL,
	"recursive" boolean DEFAULT true NOT NULL,
	"status" "drive_import_status" DEFAULT 'queued' NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"reused" integer DEFAULT 0 NOT NULL,
	"rejected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"requested_by" uuid,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drive_import_jobs" ADD CONSTRAINT "drive_import_jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_import_jobs" ADD CONSTRAINT "drive_import_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drive_import_jobs_client_idx" ON "drive_import_jobs" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "drive_import_jobs_status_idx" ON "drive_import_jobs" USING btree ("status","queued_at");