ALTER TABLE "problem_submissions" ADD COLUMN "fail_code" text;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "game_id" text DEFAULT 'k8s' NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "target_state" jsonb;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "seedable" boolean DEFAULT false NOT NULL;