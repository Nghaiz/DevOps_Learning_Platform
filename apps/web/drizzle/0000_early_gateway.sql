CREATE TYPE "public"."sandbox_tier" AS ENUM('sysbox', 'gvisor', 'kata');--> statement-breakpoint
CREATE TYPE "public"."session_event" AS ENUM('created', 'claimed', 'expired', 'reaped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"event" "session_event" NOT NULL,
	"tier" "sandbox_tier" NOT NULL,
	"pod_name" text,
	"namespace" text,
	"expires_at" timestamp with time zone,
	"detail" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "progress_user_lesson_key" ON "progress" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_audit_session_id_idx" ON "sessions_audit" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_audit_user_id_idx" ON "sessions_audit" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" USING btree ("email");