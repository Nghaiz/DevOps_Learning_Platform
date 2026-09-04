CREATE TABLE "lab_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lab_id" text NOT NULL,
	"session_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"display_name_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_task_results" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"task_id" text NOT NULL,
	"exit_code" integer NOT NULL,
	"output" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_attempts" ADD CONSTRAINT "lab_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_task_results" ADD CONSTRAINT "lab_task_results_attempt_id_lab_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."lab_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_attempts_user_lab_started_idx" ON "lab_attempts" USING btree ("user_id","lab_id","started_at");--> statement-breakpoint
CREATE INDEX "lab_attempts_lab_submitted_idx" ON "lab_attempts" USING btree ("lab_id","submitted_at");--> statement-breakpoint
CREATE INDEX "lab_task_results_attempt_task_checked_idx" ON "lab_task_results" USING btree ("attempt_id","task_id","checked_at");