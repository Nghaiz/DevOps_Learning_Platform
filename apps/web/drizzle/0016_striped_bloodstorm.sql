CREATE TYPE "public"."exam_seed_strategy" AS ENUM('fixed', 'per-student');--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"exam_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"seed" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp (3) with time zone,
	CONSTRAINT "exam_attempts_pk" PRIMARY KEY("exam_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"problem_codes" text[] NOT NULL,
	"duration_minutes" integer NOT NULL,
	"seed_strategy" "exam_seed_strategy" NOT NULL,
	"fixed_seed" integer,
	"opens_at" timestamp (3) with time zone,
	"closes_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_attempts_user_idx" ON "exam_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exams_created_idx" ON "exams" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "exams_class_idx" ON "exams" USING btree ("class_id");