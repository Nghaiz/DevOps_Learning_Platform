CREATE TYPE "public"."content_kind" AS ENUM('lesson', 'lab', 'playground');--> statement-breakpoint
CREATE TYPE "public"."content_state" AS ENUM('draft', 'publishing', 'published', 'archived');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'author';--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "content_kind" NOT NULL,
	"author_id" text NOT NULL,
	"state" "content_state" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"difficulty" text,
	"estimated_minutes" integer,
	"tier" "sandbox_tier" NOT NULL,
	"capabilities" jsonb NOT NULL,
	"backend_image_id" text NOT NULL,
	"interface_layout" text,
	"assets" jsonb NOT NULL,
	"intro" jsonb,
	"finish" jsonb,
	"setup" jsonb,
	"pass_threshold_percent" integer,
	"leaderboard" boolean,
	"ttl_seconds" integer,
	"publish_started_at" timestamp with time zone,
	"publish_error" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"task_id" text,
	"title" text,
	"markdown" text NOT NULL,
	"setup_foreground" text,
	"setup_background" text,
	"verify_script" text,
	"weight" integer,
	"hint" text
);
--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_steps" ADD CONSTRAINT "content_steps_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_assets_storage_key_key" ON "content_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "content_assets_content_idx" ON "content_assets" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "content_items_kind_state_idx" ON "content_items" USING btree ("kind","state");--> statement-breakpoint
CREATE INDEX "content_items_author_state_idx" ON "content_items" USING btree ("author_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "content_steps_content_ordinal_key" ON "content_steps" USING btree ("content_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "content_steps_content_task_key" ON "content_steps" USING btree ("content_id","task_id");