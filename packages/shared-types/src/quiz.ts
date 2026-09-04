import { z } from 'zod';

import { scenarioIdSchema } from './scenario.ts';

/**
 * DTO của QUIZ (P10 — 10.B/10.C).
 *
 * Quiz là loại nội dung duy nhất KHÔNG cần sandbox: không step, không script,
 * không pod. Đó là toàn bộ lý do nó không đi qua `contentBaseSchema` như
 * lesson/lab/playground — xem `docs/quiz-format.md` § "Vì sao bảng riêng".
 *
 * ## Điều quan trọng nhất trong file này
 *
 * Có HAI cây type, không phải một cây với một cờ:
 *
 * · `*ForLearner` — thứ rời server tới trình duyệt TRƯỚC khi nộp. Không có
 *   `isCorrect`, không có `explanation`.
 * · `*Full` — thứ chỉ sống trong tiến trình server (và trong tay tác giả).
 *
 * Tách hai cây là một quyết định KIỂU DỮ LIỆU, không phải một điều kiện `if`
 * (phase-10 task 7). Một `if` sai là một lỗi runtime người ta phát hiện bằng
 * devtools — sau khi đáp án đã ra khỏi máy chủ. Một type sai không biên dịch
 * được, nên nó không bao giờ chạy.
 *
 * Rào compile được dựng bằng hai lớp cùng lúc, và cần CẢ HAI:
 *
 * 1. `.strict()` trên schema — chặn ở RUNTIME khi parse.
 * 2. `isCorrect?: never` / `explanation?: never` trên type — chặn ở COMPILE.
 *
 * Lớp 2 tồn tại vì lớp 1 một mình KHÔNG đủ, và lý do rất dễ bỏ qua: TypeScript
 * chỉ kiểm "field thừa" trên **object literal tươi**. Một `QuizChoiceFull[]`
 * gán vào `{id, markdown}[]` là hợp lệ về mặt cấu trúc — mảng không phải
 * literal tươi, nên không có lượt kiểm nào chạy. `isCorrect?: never` làm phép
 * gán đó hỏng: `boolean` không gán được vào `never`.
 */

/**
 * Hai kiểu câu hỏi, và CHỈ hai (task 6).
 *
 * Tự luận cần người chấm — nó kéo theo hàng đợi chấm, vai trò người chấm, và
 * tranh chấp điểm. Đó là một sản phẩm khác, không phải một kiểu câu hỏi nữa.
 */
export const QUIZ_QUESTION_KINDS = ['single', 'multiple'] as const;
export type QuizQuestionKind = (typeof QUIZ_QUESTION_KINDS)[number];

/**
 * Vòng đời quiz — `draft` → `published` → `archived`. CỐ Ý thiếu `publishing`.
 *
 * `content_states` có `publishing` vì lượt chạy thử của lesson/lab dựng sandbox
 * thật (tới ~49 s ở P7) và không vừa trong một request. Quiz không có gì để
 * chạy thử: cổng xuất bản của nó là `assertQuizPublishable`, thuần logic, vài
 * micro-giây. Một trạng thái không bao giờ tồn tại quá một mili-giây là một
 * trạng thái mà mọi người đọc code sẽ hiểu sai về sau.
 *
 * ⛔ `archived` thay cho XOÁ, cùng lý lẽ `content_states`: `quiz_attempts` giữ
 * lịch sử người học, và một quiz biến mất làm lịch sử đó trỏ vào hư không.
 */
export const QUIZ_STATES = ['draft', 'published', 'archived'] as const;
export type QuizState = (typeof QUIZ_STATES)[number];

/**
 * Quy tắc chấm câu NHIỀU ĐÁP ÁN (task 10).
 *
 * Một literal, không phải một chuỗi tự do — và nó nằm TRONG DTO người học chứ
 * không phải trong một hằng số của FE. Ô AC đòi *"quy tắc hiện trên UI trước
 * khi người học làm"*; nếu FE tự viết câu chữ đó thì luật hiển thị và luật chấm
 * là hai nguồn, và chúng lệch nhau ở lần đầu tiên server đổi cách chấm.
 *
 * Thêm quy tắc thứ hai (chấm từng phần) là đổi schema + đổi `gradeQuiz` cùng
 * lúc — cố ý khó, vì "được nửa điểm" là chỗ đẻ ra tranh cãi mà task 10 tránh.
 */
export const QUIZ_MULTIPLE_ANSWER_RULE = 'all-or-nothing' as const;
export type QuizMultipleAnswerRule = typeof QUIZ_MULTIPLE_ANSWER_RULE;

/** Định danh BỀN của một lựa chọn — đi vào `quiz_answers.selected_choice_ids`. */
export const quizChoiceIdSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'quiz choice id chỉ nhận [a-z0-9-], bắt đầu/kết thúc bằng chữ-số, dài 1–63 ký tự',
  );

/**
 * Định danh BỀN của một câu hỏi — cùng lý lẽ `labTaskIdSchema`: nó đi vào
 * `quiz_answers.question_id`, nên suy nó từ vị trí sẽ làm mọi câu trả lời đã
 * lưu trỏ nhầm câu hỏi khi tác giả chèn một câu vào giữa. Không lỗi, không cảnh
 * báo — chỉ là điểm gắn sai câu.
 */
export const quizQuestionIdSchema = quizChoiceIdSchema;

// ─────────────────────────────────────────────── cây ĐẦY ĐỦ (chỉ ở server)

export const quizChoiceFullSchema = z
  .object({
    id: quizChoiceIdSchema,
    markdown: z.string().min(1),
    isCorrect: z.boolean(),
  })
  .strict();
export type QuizChoiceFull = z.infer<typeof quizChoiceFullSchema>;

export const quizQuestionFullSchema = z
  .object({
    id: quizQuestionIdSchema,
    /** Vị trí hiển thị. KHÁC `id` — đổi thứ tự không được làm hỏng câu trả lời đã lưu. */
    ordinal: z.number().int().min(0),
    kind: z.enum(QUIZ_QUESTION_KINDS),
    markdown: z.string().min(1),
    /** Hiện SAU khi nộp. `null` = tác giả không viết giải thích cho câu này. */
    explanation: z.string().nullable(),
    /** Task 13: ≥2 lựa chọn. Ràng buộc "≥1 đúng, không phải tất cả" ở `quiz/validate.ts`. */
    choices: z.array(quizChoiceFullSchema).min(2),
  })
  .strict();
export type QuizQuestionFull = z.infer<typeof quizQuestionFullSchema>;

export const quizFullSchema = z
  .object({
    id: scenarioIdSchema,
    title: z.string().min(1),
    description: z.string().nullable(),
    /**
     * Mốc ĐẠT theo % số câu đúng. Dữ liệu chính — người soạn nhập, không tính
     * được từ đâu. Đây là thứ `learning_paths.sequential` đọc để trả lời "item
     * này đã đạt chưa" (đối xứng với `labs.passThresholdPercent`).
     */
    passThresholdPercent: z.number().int().min(0).max(100),
    multipleAnswerRule: z.literal(QUIZ_MULTIPLE_ANSWER_RULE),
    questions: z.array(quizQuestionFullSchema),
  })
  .strict();
export type QuizFull = z.infer<typeof quizFullSchema>;

// ─────────────────────────────────────────── cây NGƯỜI HỌC (rời server được)

export const quizChoiceForLearnerSchema = z
  .object({
    id: quizChoiceIdSchema,
    markdown: z.string().min(1),
  })
  .strict();

/**
 * ⛔ `isCorrect?: never` là RÀO COMPILE, không phải trang trí.
 *
 * Thử `const c: QuizChoiceForLearner = someFullChoice` → `Type 'boolean' is not
 * assignable to type 'never'`. Test `quiz-dto-leak.test.ts` khẳng định điều đó
 * bằng `@ts-expect-error`: nếu một ngày nào đó rào này biến mất, dòng đó KHÔNG
 * còn lỗi nữa và `tsc` gãy — tức cổng tự báo khi chính nó bị tháo.
 */
export type QuizChoiceForLearner = z.infer<typeof quizChoiceForLearnerSchema> & {
  readonly isCorrect?: never;
};

export const quizQuestionForLearnerSchema = z
  .object({
    id: quizQuestionIdSchema,
    ordinal: z.number().int().min(0),
    kind: z.enum(QUIZ_QUESTION_KINDS),
    markdown: z.string().min(1),
    choices: z.array(quizChoiceForLearnerSchema).min(2),
  })
  .strict();

/**
 * `Omit` + gán lại `choices` là BẮT BUỘC, không phải cầu kỳ: `z.infer` của
 * schema trên cho `choices: {id, markdown}[]`, một type mà `QuizChoiceFull[]`
 * gán vừa về mặt cấu trúc. Chỉ khi phần tử mang nhãn `isCorrect?: never` thì
 * phép gán đó mới hỏng.
 *
 * `explanation?: never` chặn nhánh rò thứ hai: giải thích thường TIẾT LỘ đáp án
 * ("vì `kubectl get pods -A` mới liệt kê mọi namespace"), nên nó cũng chỉ được
 * đi ra SAU khi nộp — trong `QuizQuestionResult`, không phải ở đây.
 */
export type QuizQuestionForLearner = Omit<
  z.infer<typeof quizQuestionForLearnerSchema>,
  'choices'
> & {
  readonly choices: readonly QuizChoiceForLearner[];
  readonly explanation?: never;
};

export const quizForLearnerSchema = z
  .object({
    id: scenarioIdSchema,
    title: z.string().min(1),
    description: z.string().nullable(),
    passThresholdPercent: z.number().int().min(0).max(100),
    /** Task 10 / AC #6 — FE render câu chữ TỪ ĐÂY, không tự viết. */
    multipleAnswerRule: z.literal(QUIZ_MULTIPLE_ANSWER_RULE),
    questions: z.array(quizQuestionForLearnerSchema),
  })
  .strict();

export type QuizForLearner = Omit<z.infer<typeof quizForLearnerSchema>, 'questions'> & {
  readonly questions: readonly QuizQuestionForLearner[];
};

/** Một dòng danh sách `/quiz` — không kèm câu hỏi nào. */
export const quizSummarySchema = z
  .object({
    id: scenarioIdSchema,
    title: z.string().min(1),
    description: z.string().nullable(),
    passThresholdPercent: z.number().int().min(0).max(100),
    /** TÍNH bằng `count(quiz_questions)` ở chỗ truy vấn — không phải cột. */
    questionCount: z.number().int().min(0),
  })
  .strict();
export type QuizSummary = z.infer<typeof quizSummarySchema>;

// ───────────────────────────────────────────────────── nộp bài và kết quả

/**
 * Một câu trả lời người học gửi lên.
 *
 * `selectedChoiceIds` là MẢNG cho cả hai kiểu câu hỏi — `single` chỉ là ràng
 * buộc "đúng một phần tử", kiểm ở `gradeQuiz` chứ không ở hình dạng. Hai hình
 * dạng khác nhau (chuỗi cho single, mảng cho multiple) sẽ bắt mọi consumer viết
 * một nhánh `typeof`, và nhánh đó là chỗ đầu tiên có người quên.
 */
export const quizAnswerInputSchema = z
  .object({
    questionId: quizQuestionIdSchema,
    selectedChoiceIds: z.array(quizChoiceIdSchema),
  })
  .strict();
export type QuizAnswerInput = z.infer<typeof quizAnswerInputSchema>;

/**
 * Kết quả MỘT câu — chỉ tồn tại SAU khi nộp. Đây là chỗ `isCorrect` và
 * `explanation` hợp pháp rời server.
 */
export const quizQuestionResultSchema = z
  .object({
    questionId: quizQuestionIdSchema,
    correct: z.boolean(),
    selectedChoiceIds: z.array(quizChoiceIdSchema),
    correctChoiceIds: z.array(quizChoiceIdSchema),
    explanation: z.string().nullable(),
  })
  .strict();
export type QuizQuestionResult = z.infer<typeof quizQuestionResultSchema>;

/**
 * Điểm một lượt nộp — **TÍNH, không lưu** (task 8).
 *
 * `quiz_attempts` cố ý KHÔNG có cột `score`, và `quiz_answers` cố ý KHÔNG có
 * cột `is_correct`: cả hai suy được 100% từ `selected_choice_ids` so với
 * `quiz_choices.is_correct`. Lưu thêm là dựng nguồn sự thật thứ hai, đúng thứ
 * `rules/code-conventions.md` § No Derived Fields cấm — và nó sẽ lệch ở lần đầu
 * tiên tác giả sửa một đáp án.
 */
export const quizScoreSchema = z
  .object({
    correctCount: z.number().int().min(0),
    questionCount: z.number().int().min(0),
    /** Làm tròn XUỐNG — cùng lý lẽ `labScoreSchema.percent`: 79.6% phải hiện "79%" và trượt. */
    percent: z.number().int().min(0).max(100),
    passed: z.boolean(),
  })
  .strict();
export type QuizScore = z.infer<typeof quizScoreSchema>;

export const quizAttemptResultSchema = z
  .object({
    attemptId: z.string().min(1),
    /** TÍNH bằng cách đếm lượt nộp trước đó — KHÔNG phải cột (xem `quizScoreSchema`). */
    attemptNumber: z.number().int().positive(),
    submittedAt: z.string(),
    score: quizScoreSchema,
    questions: z.array(quizQuestionResultSchema),
  })
  .strict();
export type QuizAttemptResult = z.infer<typeof quizAttemptResultSchema>;
