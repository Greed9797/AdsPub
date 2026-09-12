ALTER TABLE "batches" ADD COLUMN "plan_generation_id" uuid;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "plan_feedback" "ai_feedback";--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "plan_regenerations" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_plan_generation_id_ai_generations_id_fk" FOREIGN KEY ("plan_generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" DROP COLUMN "feedback";