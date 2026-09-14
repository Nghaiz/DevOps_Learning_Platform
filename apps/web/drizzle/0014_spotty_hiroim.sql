ALTER TABLE "problem_submissions" ADD COLUMN "passed" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "problem_submissions" ADD COLUMN "total" integer DEFAULT 0 NOT NULL;