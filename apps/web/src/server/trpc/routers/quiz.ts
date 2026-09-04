import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { gradeQuiz } from '@devops-platform/scenario/quiz-score';
import { normalizeNewlines } from '@devops-platform/scenario/content-blocks';
import { scenarioIdSchema } from '@devops-platform/shared-types/scenario';
import {
  QUIZ_QUESTION_KINDS,
  quizAnswerInputSchema,
  quizChoiceIdSchema,
  quizQuestionIdSchema,
  type QuizAnswerInput,
  type QuizAttemptResult,
  type QuizForLearner,
  type QuizFull,
} from '@devops-platform/shared-types/quiz';
import { assertContentOwner } from '../../content/authz';
import type { Database, DbOrTx } from '../../db/client';
import { quizAnswers, quizAttempts, quizChoices, quizQuestions, quizzes } from '../../db/schema';
import {
  findQuizForWrite,
  listPublishedQuizzesPage,
  listQuizzesAuthoredBy,
  loadQuizFull,
  quizIdTaken,
  toLearnerQuiz,
} from '../../quiz/repository';
import { assertQuizPublishable } from '../../quiz/validate';
import { checkRateLimit, RATE_LIMIT_WINDOW_MS } from '../../security/rate-limit';
import {
  authorProcedure,
  createTRPCRouter,
  listInputSchema,
  protectedProcedure,
  type AuthedUser,
} from '../init';

/**
 * `quiz.*` — P10 10.B/10.C/10.D.
 *
 * ## Bất biến số một của router này
 *
 * ⛔ **Đáp án không bao giờ rời server trước khi nộp.** Mọi đường đọc của NGƯỜI
 * HỌC (`list`, `get`) trả `QuizForLearner`, một type mà `isCorrect` và
 * `explanation` được khai `never` — nên để lộ chúng là một lỗi **compile**,
 * không phải một lỗi runtime ai đó tìm thấy bằng devtools (task 7).
 *
 * Đường của TÁC GIẢ (`edit`) trả `QuizFull` KÈM đáp án, và điều đó đúng: tác
 * giả phải thấy đáp án bài của chính mình. Nó đi qua `authorProcedure` +
 * `assertContentOwner` — hai cổng, cùng khuôn P9.
 *
 * ## Luật 1 ở dạng mạnh
 *
 * Không input schema nào dưới đây khai `userId` hay `authorId`. Chủ sở hữu tới
 * từ hai chỗ: `ctx.user.id` khi TẠO, và cột `author_id` ĐỌC TỪ DB khi SỬA. Một
 * field `authorId` trong input là một field kẻ tấn công điền được, và mọi lượt
 * kiểm sau đó so giá trị họ cung cấp với chính nó.
 */

/**
 * Cổng chống DÒ ĐÁP ÁN (task 11 / AC #7) — bucket RIÊNG cho `submit`.
 *
 * `protectedProcedure` đã giới hạn 20 mutation/phút cho mỗi user, và hạn mức đó
 * dùng CHUNG cho mọi mutation. Nó không đủ ở đây vì hai lý do:
 *
 * 1. Nó là một ngân sách chia sẻ — người đang dò đáp án có thể tiêu hết nó vào
 *    `submit`, nhưng cũng có thể một phiên bình thường tiêu gần hết nó vào việc
 *    khác rồi `submit` bị chặn oan.
 * 2. Ô AC đòi chứng minh được rằng ĐƯỜNG NỘP bị giới hạn. Một hạn mức phụ thuộc
 *    vào các mutation khác thì không chứng minh được bằng một test độc lập.
 *
 * Con số 6: một quiz 10 câu hai lựa chọn cần trung bình ~512 lượt nộp để dò hết
 * bằng vũ lực; ở 6 lượt/phút đó là hơn một tiếng rưỡi cho MỘT quiz — trong khi
 * người học thật hiếm khi nộp lại quá vài lần một phút. Cố ý KHÔNG có trần cứng
 * số lần làm (task 11: mục tiêu là học, không phải thi).
 *
 * Dùng lại `checkRateLimit` (SSOT với `proxy.ts` và `init.ts`) thay vì một lớp
 * thứ hai. Cùng giới hạn đã ghi ở `init.ts`: in-memory per-process, nên nhiều
 * replica = nhiều bucket.
 */
export const QUIZ_SUBMIT_LIMIT_PER_MIN = 6;

function assertSubmitRateLimit(userId: string): void {
  if (
    !checkRateLimit(
      `quiz:submit:${userId}`,
      Date.now(),
      RATE_LIMIT_WINDOW_MS,
      QUIZ_SUBMIT_LIMIT_PER_MIN,
    )
  ) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Nộp quá nhanh — thử lại sau một phút',
    });
  }
}

// ---------------------------------------------------------------- input

const lfText = z.string().transform(normalizeNewlines);

const choiceInput = z
  .object({
    id: quizChoiceIdSchema,
    markdown: lfText,
    isCorrect: z.boolean(),
  })
  .strict();

const questionInput = z
  .object({
    id: quizQuestionIdSchema,
    kind: z.enum(QUIZ_QUESTION_KINDS),
    markdown: lfText,
    explanation: lfText.nullable().default(null),
    choices: z.array(choiceInput),
  })
  .strict();

/**
 * ⛔ CỐ Ý VẮNG MẶT: `authorId` (luật 1), `state` (đổi qua `publish`/`archive`,
 * không qua một field). `questions` được phép RỖNG ở đây — bản nháp lưu tự do;
 * cổng là `publish` (xem `quiz/validate.ts`).
 */
const quizBodyInput = z
  .object({
    title: z.string().min(1),
    description: lfText.nullable().default(null),
    passThresholdPercent: z.number().int().min(0).max(100),
    questions: z.array(questionInput),
  })
  .strict();

const createInput = quizBodyInput.extend({ id: scenarioIdSchema }).strict();
const updateInput = quizBodyInput.extend({ id: scenarioIdSchema }).strict();
const idInput = z.object({ quizId: scenarioIdSchema }).strict();
const submitInput = z
  .object({ quizId: scenarioIdSchema, answers: z.array(quizAnswerInputSchema) })
  .strict();
const listAttemptsInput = listInputSchema.extend({ quizId: scenarioIdSchema }).strict();
const attemptIdInput = z.object({ attemptId: z.string().min(1) }).strict();

// ---------------------------------------------------------------- helper

function authorVisibility(user: AuthedUser): { authorId: string | null; isAdmin: boolean } {
  return { authorId: user.id, isAdmin: user.role === 'admin' };
}

const LEARNER_VISIBILITY = { authorId: null, isAdmin: false } as const;

async function requirePublishedQuiz(db: Database, quizId: string): Promise<QuizFull> {
  const quiz = await loadQuizFull(db, quizId, LEARNER_VISIBILITY);
  if (quiz === null) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có quiz đó' });
  }
  return quiz;
}

/**
 * Câu trả lời gửi lên phải trỏ tới câu hỏi và lựa chọn CÓ THẬT của quiz này.
 *
 * ⚠ Từ chối id lạ KHÔNG tiết lộ gì về đáp án — nó chỉ nói "lựa chọn đó không
 * thuộc câu hỏi này", điều mà client đã biết vì chính nó vừa nhận danh sách.
 * `gradeQuiz` một mình cũng đã coi id lạ là sai (hai tập lệch nhau), nên đây là
 * lớp thứ hai: nó biến một BUG của client thành một thông báo đọc được, thay vì
 * một điểm 0 khó hiểu.
 *
 * Ràng buộc `single` ⇒ tối đa một lựa chọn cũng được kiểm ở đây: nộp hai lựa
 * chọn cho câu một-đáp-án là client hỏng, không phải người học sai.
 */
function assertAnswersReferenceQuiz(quiz: QuizFull, answers: readonly QuizAnswerInput[]): void {
  const byQuestion = new Map(quiz.questions.map((question) => [question.id, question]));
  const seen = new Set<string>();

  for (const answer of answers) {
    const question = byQuestion.get(answer.questionId);
    if (question === undefined) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Câu hỏi không thuộc quiz này: ${answer.questionId}`,
      });
    }
    if (seen.has(answer.questionId)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Trả lời trùng cho một câu hỏi: ${answer.questionId}`,
      });
    }
    seen.add(answer.questionId);

    const known = new Set(question.choices.map((choice) => choice.id));
    for (const choiceId of answer.selectedChoiceIds) {
      if (!known.has(choiceId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Lựa chọn không thuộc câu hỏi ${answer.questionId}: ${choiceId}`,
        });
      }
    }
    if (question.kind === 'single' && new Set(answer.selectedChoiceIds).size > 1) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Câu ${answer.questionId} chỉ nhận một lựa chọn`,
      });
    }
  }
}

/** Hàng DB → `QuizAnswerInput`. `selected_choice_ids` là jsonb, nên ép kiểu tại biên đọc. */
/** Export (P13 — `me.listQuizAttempts` dùng lại). */
export function toAnswerInputs(
  rows: readonly { questionId: string; selectedChoiceIds: unknown }[],
): readonly QuizAnswerInput[] {
  return rows.map((row) => ({
    questionId: row.questionId,
    selectedChoiceIds: row.selectedChoiceIds as string[],
  }));
}

// ---------------------------------------------------------------- router

export const quizRouter = createTRPCRouter({
  /**
   * Danh sách quiz đã xuất bản. Luật 4 — `limit` bị ÉP về ≤100.
   *
   * D9 (phase-13) — `nextCursor` THẬT qua `listPublishedQuizzesPage`.
   */
  list: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const { items: rows, hasMore } = await listPublishedQuizzesPage(ctx.db, input.limit, input.cursor);
    const last = rows[rows.length - 1];
    return {
      items: rows.map(({ state: _state, ...summary }) => summary),
      limit: input.limit,
      nextCursor: hasMore && last !== undefined ? last.id : null,
    };
  }),

  /**
   * Nội dung quiz cho NGƯỜI HỌC.
   *
   * ⛔ Kiểu trả về khai TƯỜNG MINH `QuizForLearner`. Đó là ô AC #4 ở dạng thi
   * hành được: đổi dòng này thành `return quiz` (bản `QuizFull`) KHÔNG biên
   * dịch được, vì `isCorrect: boolean` không gán được vào `never`.
   */
  get: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }): Promise<{ quiz: QuizForLearner }> => {
      const quiz = await requirePublishedQuiz(ctx.db, input.quizId);
      return { quiz: toLearnerQuiz(quiz) };
    }),

  /**
   * Nộp bài — chấm Ở SERVER, trả kết quả từng câu + giải thích (task 9).
   *
   * Trước lời gọi này client không có gì để đoán; sau nó, client có đủ để hiển
   * thị mình sai ở đâu và vì sao.
   */
  submit: protectedProcedure
    .input(submitInput)
    .mutation(async ({ ctx, input }): Promise<QuizAttemptResult> => {
      assertSubmitRateLimit(ctx.user.id);

      const quiz = await requirePublishedQuiz(ctx.db, input.quizId);
      assertAnswersReferenceQuiz(quiz, input.answers);

      const grading = gradeQuiz(quiz, input.answers);
      const attemptId = randomUUID();
      const submittedAt = new Date();

      /**
       * Attempt + answers trong MỘT transaction: một lượt nộp không có câu trả
       * lời nào là một dòng lịch sử nói dối (điểm 0 vì "không trả lời gì" chứ
       * không phải vì sai), và ngoài transaction đó là một cửa sổ có thật.
       */
      await ctx.db.transaction(async (tx) => {
        await tx
          .insert(quizAttempts)
          .values({ id: attemptId, userId: ctx.user.id, quizId: quiz.id, submittedAt });
        if (input.answers.length > 0) {
          await tx.insert(quizAnswers).values(
            input.answers.map((answer) => ({
              attemptId,
              questionId: answer.questionId,
              selectedChoiceIds: answer.selectedChoiceIds,
            })),
          );
        }
      });

      /**
       * `attemptNumber` TÍNH bằng cách đếm, không phải đọc một cột — xem chú
       * thích `⛔ CẤM attempt_no` ở `quiz_attempts`. Đếm SAU khi chèn, nên lượt
       * vừa nộp đã nằm trong con số.
       */
      const priorRows = await ctx.db
        .select({ id: quizAttempts.id })
        .from(quizAttempts)
        .where(and(eq(quizAttempts.userId, ctx.user.id), eq(quizAttempts.quizId, quiz.id)));

      return {
        attemptId,
        attemptNumber: priorRows.length,
        submittedAt: submittedAt.toISOString(),
        score: grading.score,
        questions: [...grading.questions],
      };
    }),

  /** Lịch sử làm quiz của CHÍNH người gọi. Không nhận `userId` (luật 1). */
  listAttempts: protectedProcedure.input(listAttemptsInput).query(async ({ ctx, input }) => {
    const quiz = await requirePublishedQuiz(ctx.db, input.quizId);
    const rows = await ctx.db
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, ctx.user.id), eq(quizAttempts.quizId, input.quizId)))
      .orderBy(desc(quizAttempts.submittedAt))
      .limit(input.limit);

    if (rows.length === 0) {
      return { items: [], limit: input.limit };
    }

    // Một truy vấn cho cả trang, không N+1; `limit` bị cap 100 (luật 4) nên
    // `inArray` luôn bounded.
    const answerRows = await ctx.db
      .select()
      .from(quizAnswers)
      .where(
        inArray(
          quizAnswers.attemptId,
          rows.map((row) => row.id),
        ),
      );

    const byAttempt = new Map<string, typeof answerRows>();
    for (const answer of answerRows) {
      const bucket = byAttempt.get(answer.attemptId) ?? [];
      bucket.push(answer);
      byAttempt.set(answer.attemptId, bucket);
    }

    return {
      items: rows.map((row) => ({
        attemptId: row.id,
        submittedAt: row.submittedAt.toISOString(),
        score: gradeQuiz(quiz, toAnswerInputs(byAttempt.get(row.id) ?? [])).score,
      })),
      limit: input.limit,
    };
  }),

  /** Một lượt nộp — chỉ chủ sở hữu. Chấm LẠI lúc đọc (điểm không được lưu). */
  getAttempt: protectedProcedure
    .input(attemptIdInput)
    .query(async ({ ctx, input }): Promise<QuizAttemptResult> => {
      const [attempt] = await ctx.db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.id, input.attemptId))
        .limit(1);

      // NOT_FOUND cho cả "không tồn tại" lẫn "của người khác" — cùng lý lẽ
      // `assertContentOwner`: người dò id không cần biết id đó có thật không.
      if (attempt === undefined || attempt.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có lượt làm đó' });
      }

      const quiz = await requirePublishedQuiz(ctx.db, attempt.quizId);
      const answerRows = await ctx.db
        .select()
        .from(quizAnswers)
        .where(eq(quizAnswers.attemptId, attempt.id));
      const grading = gradeQuiz(quiz, toAnswerInputs(answerRows));

      const priorRows = await ctx.db
        .select({ id: quizAttempts.id, submittedAt: quizAttempts.submittedAt })
        .from(quizAttempts)
        .where(and(eq(quizAttempts.userId, ctx.user.id), eq(quizAttempts.quizId, attempt.quizId)))
        .orderBy(asc(quizAttempts.submittedAt));

      return {
        attemptId: attempt.id,
        attemptNumber: priorRows.findIndex((row) => row.id === attempt.id) + 1,
        submittedAt: attempt.submittedAt.toISOString(),
        score: grading.score,
        questions: [...grading.questions],
      };
    }),

  // ─────────────────────────────────────────────── soạn quiz (10.D)

  /** Quiz của CHÍNH tác giả đang đăng nhập. */
  listMine: authorProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const rows = await listQuizzesAuthoredBy(ctx.db, ctx.user.id, input.limit);
    return { items: rows, limit: input.limit };
  }),

  /** Quiz ĐẦY ĐỦ kèm đáp án — chỉ chủ sở hữu (hoặc admin). */
  edit: authorProcedure.input(idInput).query(async ({ ctx, input }): Promise<{ quiz: QuizFull }> => {
    const record = await findQuizForWrite(ctx.db, input.quizId);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có quiz đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    const quiz = await loadQuizFull(ctx.db, input.quizId, authorVisibility(ctx.user));
    if (quiz === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có quiz đó' });
    }
    return { quiz };
  }),

  create: authorProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    if (await quizIdTaken(ctx.db, input.id)) {
      throw new TRPCError({ code: 'CONFLICT', message: `Id đã được dùng: ${input.id}` });
    }
    await ctx.db.transaction(async (tx) => {
      await tx.insert(quizzes).values({
        id: input.id,
        // Chủ sở hữu từ `ctx.user.id`, KHÔNG từ input (luật 1).
        authorId: ctx.user.id,
        state: 'draft',
        title: input.title,
        description: input.description,
        passThresholdPercent: input.passThresholdPercent,
      });
      await writeQuestions(tx, input.id, input.questions);
    });
    return { id: input.id };
  }),

  update: authorProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const record = await findQuizForWrite(ctx.db, input.id);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có quiz đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(quizzes)
        .set({
          title: input.title,
          description: input.description,
          passThresholdPercent: input.passThresholdPercent,
          updatedAt: new Date(),
        })
        .where(eq(quizzes.id, input.id));
      /**
       * Thay TOÀN BỘ tập câu hỏi thay vì diff từng câu — cùng lý lẽ
       * `authoring.update`: xoá-rồi-chèn trong MỘT transaction là nguyên tử;
       * ngoài transaction nó là một cửa sổ mà quiz không có câu nào.
       *
       * `quiz_choices` biến mất theo `ON DELETE CASCADE` của `question_row_id`.
       */
      await tx.delete(quizQuestions).where(eq(quizQuestions.quizId, input.id));
      await writeQuestions(tx, input.id, input.questions);
    });
    return { id: input.id };
  }),

  /**
   * Xuất bản — cổng là `assertQuizPublishable`, thuần logic, ĐỒNG BỘ.
   *
   * Không có trạng thái `publishing` ở đây và đó là chủ đích: lesson/lab cần nó
   * vì lượt chạy thử dựng sandbox thật (tới ~49 s), không vừa trong một request.
   * Quiz không chạy gì cả — thêm một trạng thái trung gian không bao giờ tồn tại
   * quá một mili-giây chỉ để "cho giống" là thêm một thứ để hiểu sai về sau.
   */
  publish: authorProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const record = await findQuizForWrite(ctx.db, input.quizId);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có quiz đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    const quiz = await loadQuizFull(ctx.db, input.quizId, authorVisibility(ctx.user));
    if (quiz === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có quiz đó' });
    }
    assertQuizPublishable(quiz);

    await ctx.db
      .update(quizzes)
      .set({ state: 'published', updatedAt: new Date() })
      .where(eq(quizzes.id, input.quizId));
    return { id: input.quizId, state: 'published' as const };
  }),

  /** `archive` thay cho XOÁ — `quiz_attempts` giữ lịch sử người học. */
  archive: authorProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const record = await findQuizForWrite(ctx.db, input.quizId);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có quiz đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    await ctx.db
      .update(quizzes)
      .set({ state: 'archived', updatedAt: new Date() })
      .where(eq(quizzes.id, input.quizId));
    return { id: input.quizId, state: 'archived' as const };
  }),
});

/**
 * Ghi câu hỏi + lựa chọn. `ordinal` sinh từ VỊ TRÍ trong mảng người soạn gửi —
 * thứ tự hiển thị là thứ tự họ sắp, và nó không phải một field họ tự đánh số
 * (hai câu cùng số là một lỗi unique-index khó hiểu, thay vì một thứ tự rõ ràng).
 *
 * Gõ `DbOrTx` (`db/client.ts`) chứ không `Database`: Drizzle trao cho callback
 * của `transaction` một kiểu KHÁC, và vá bằng `as` sẽ im lặng nuốt một lỗi thật
 * ở lần nâng phiên bản sau.
 *
 * Chèn TUẦN TỰ theo câu hỏi vì mỗi câu cần `id` (uuid) do DB sinh để làm khoá
 * ngoại cho lựa chọn của nó — `returning()` là chỗ lấy nó. Số câu mỗi quiz nhỏ
 * và cả vòng lặp nằm trong một transaction.
 */
async function writeQuestions(
  tx: DbOrTx,
  quizId: string,
  questions: readonly z.infer<typeof questionInput>[],
): Promise<void> {
  for (const [index, question] of questions.entries()) {
    const inserted = await tx
      .insert(quizQuestions)
      .values({
        quizId,
        questionId: question.id,
        ordinal: index,
        kind: question.kind,
        markdown: question.markdown,
        explanation: question.explanation,
      })
      .returning({ id: quizQuestions.id });

    const questionRowId = inserted[0]?.id;
    if (questionRowId === undefined) {
      // Errors over silent fallbacks: bỏ qua ở đây là ghi một quiz thiếu câu
      // mà không ai được báo.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Không chèn được câu hỏi ${question.id}`,
      });
    }

    if (question.choices.length > 0) {
      await tx.insert(quizChoices).values(
        question.choices.map((choice, choiceIndex) => ({
          questionRowId,
          choiceId: choice.id,
          ordinal: choiceIndex,
          markdown: choice.markdown,
          isCorrect: choice.isCorrect,
        })),
      );
    }
  }
}
