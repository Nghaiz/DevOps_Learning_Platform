CREATE TYPE "public"."problem_difficulty" AS ENUM('easy', 'medium', 'hard', 'expert');--> statement-breakpoint
CREATE TYPE "public"."problem_state" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "problem_hint_reveals" (
	"problem_code" text NOT NULL,
	"user_id" text NOT NULL,
	"hint_id" text NOT NULL,
	"revealed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_hint_reveals_pk" PRIMARY KEY("problem_code","user_id","hint_id")
);
--> statement-breakpoint
CREATE TABLE "problem_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_code" text NOT NULL,
	"user_id" text NOT NULL,
	"solved" boolean NOT NULL,
	"score" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"moves_used" integer NOT NULL,
	"hints_revealed" text[] NOT NULL,
	"submitted_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"code" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"difficulty" "problem_difficulty" NOT NULL,
	"topics" text[] NOT NULL,
	"tags" text[] NOT NULL,
	"time_limit_sec" integer,
	"initial_state" jsonb NOT NULL,
	"objectives" jsonb NOT NULL,
	"allowed_resources" jsonb,
	"hints" jsonb NOT NULL,
	"par_moves" integer,
	"state" "problem_state" DEFAULT 'draft' NOT NULL,
	"author_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "problem_hint_reveals" ADD CONSTRAINT "problem_hint_reveals_problem_code_problems_code_fk" FOREIGN KEY ("problem_code") REFERENCES "public"."problems"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_hint_reveals" ADD CONSTRAINT "problem_hint_reveals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_submissions" ADD CONSTRAINT "problem_submissions_problem_code_problems_code_fk" FOREIGN KEY ("problem_code") REFERENCES "public"."problems"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_submissions" ADD CONSTRAINT "problem_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_submissions_problem_user_idx" ON "problem_submissions" USING btree ("problem_code","user_id");--> statement-breakpoint
CREATE INDEX "problem_submissions_user_submitted_idx" ON "problem_submissions" USING btree ("user_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "problems_slug_key" ON "problems" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "problems_state_difficulty_idx" ON "problems" USING btree ("state","difficulty");--> statement-breakpoint
CREATE INDEX "problems_author_state_idx" ON "problems" USING btree ("author_id","state");--> statement-breakpoint
CREATE INDEX "problems_topics_gin_idx" ON "problems" USING gin ("topics");--> statement-breakpoint
CREATE INDEX "problems_tags_gin_idx" ON "problems" USING gin ("tags");