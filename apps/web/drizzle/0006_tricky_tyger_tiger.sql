-- P10 — lộ trình + quiz (6 bảng, 4 enum).
--
-- ⛔ RANH GIỚI: "khoá học" ở đây CHỈ là cách nhóm nội dung có thứ tự. KHÔNG cột
-- price/sku/entitlement/is_paid, KHÔNG bảng enrollments mang trạng thái thanh
-- toán. Quyền truy cập vẫn chỉ là ĐĂNG NHẬP. Một migration sau này thêm cột như
-- thế là dấu hiệu phạm vi đã trượt sang thương mại — dừng và hỏi chủ dự án.
--
-- ⛔ CỘT KHÔNG TỒN TẠI, và đó là chủ đích (AC #2 — no-derived-fields):
--   learning_paths      : KHÔNG item_count / total_minutes / completion_percent
--                         (đếm/cộng được từ learning_path_items + tiến độ item)
--   learning_path_items : KHÔNG title (thuộc về bài, tác giả sửa được)
--                         KHÔNG passed/completed (thuộc cặp người-học × item,
--                         đã có ba nguồn: progress / lab_attempts / quiz_attempts)
--   quiz_questions      : KHÔNG choice_count / correct_count (đếm được)
--   quiz_attempts       : KHÔNG score / percent / passed / attempt_no
--   quiz_answers        : KHÔNG is_correct (so với quiz_choices.is_correct là ra)
--
-- LÝ DO TỒN TẠI của TỪNG cột còn lại ghi ngay tại chỗ khai báo, ở
-- `apps/web/src/server/db/schema.ts` § "LỘ TRÌNH + QUIZ" — file này do
-- drizzle-kit sinh, nên chép lý do sang đây sẽ là bản sao thứ hai trôi khỏi bản
-- gốc ở lần `db:generate` kế tiếp.
--
-- Quyết định thiết kế đầy đủ: docs/learning-path.md, docs/quiz-format.md.

CREATE TYPE "public"."learning_path_state" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."path_item_kind" AS ENUM('lesson', 'lab', 'quiz');--> statement-breakpoint
CREATE TYPE "public"."quiz_question_kind" AS ENUM('single', 'multiple');--> statement-breakpoint
CREATE TYPE "public"."quiz_state" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "learning_path_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"item_kind" "path_item_kind" NOT NULL,
	"item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_paths" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"state" "learning_path_state" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sequential" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" text NOT NULL,
	"question_id" text NOT NULL,
	"selected_choice_ids" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"quiz_id" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_row_id" uuid NOT NULL,
	"choice_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"markdown" text NOT NULL,
	"is_correct" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" text NOT NULL,
	"question_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" "quiz_question_kind" NOT NULL,
	"markdown" text NOT NULL,
	"explanation" text
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"state" "quiz_state" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"pass_threshold_percent" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_path_items" ADD CONSTRAINT "learning_path_items_path_id_learning_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_choices" ADD CONSTRAINT "quiz_choices_question_row_id_quiz_questions_id_fk" FOREIGN KEY ("question_row_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_path_items_path_ordinal_key" ON "learning_path_items" USING btree ("path_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_path_items_path_item_key" ON "learning_path_items" USING btree ("path_id","item_kind","item_id");--> statement-breakpoint
CREATE INDEX "learning_paths_author_state_idx" ON "learning_paths" USING btree ("author_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_answers_attempt_question_key" ON "quiz_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_quiz_submitted_idx" ON "quiz_attempts" USING btree ("user_id","quiz_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_choices_question_choice_key" ON "quiz_choices" USING btree ("question_row_id","choice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_choices_question_ordinal_key" ON "quiz_choices" USING btree ("question_row_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_questions_quiz_question_key" ON "quiz_questions" USING btree ("quiz_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_questions_quiz_ordinal_key" ON "quiz_questions" USING btree ("quiz_id","ordinal");--> statement-breakpoint
CREATE INDEX "quizzes_author_state_idx" ON "quizzes" USING btree ("author_id","state");