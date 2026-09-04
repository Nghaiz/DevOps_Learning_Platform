import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import {
  QUIZ_MULTIPLE_ANSWER_RULE,
  type QuizFull,
  type QuizForLearner,
  type QuizQuestionForLearner,
  type QuizQuestionFull,
  type QuizState,
  type QuizSummary,
} from '@devops-platform/shared-types/quiz';
import type { Database } from '../db/client';
import { quizChoices, quizQuestions, quizzes } from '../db/schema';

/**
 * Truy cập DB cho quiz (P10 10.B).
 *
 * ## Vì sao đường ĐỌC người-học và đường ĐỌC tác-giả là hai hàm, không phải một
 *
 * `loadQuizFull` trả `QuizFull` (có `isCorrect`, có `explanation`);
 * `toLearnerQuiz` bóc chúng đi. Cám dỗ là viết một hàm với cờ
 * `includeAnswers: boolean` — và đó chính là hình dạng lỗi mà task 7 cấm: một
 * cờ boolean đặt sai là một lỗi runtime, còn hai type khác nhau đặt sai là một
 * lỗi compile.
 *
 * `toLearnerQuiz` là chỗ DUY NHẤT dựng `QuizForLearner`, và nó khai kiểu trả về
 * tường minh — nên thêm `isCorrect` vào object literal trong hàm này KHÔNG biên
 * dịch được.
 */

export interface QuizVisibility {
  /** `null` = người học (chỉ thấy `published`). Khác `null` = tác giả/admin. */
  readonly authorId: string | null;
  readonly isAdmin: boolean;
}

/**
 * Điều kiện "ai thấy được quiz nào" — MỘT chỗ, cùng lý lẽ `content/authz.ts`:
 * không procedure nào tự viết `where(state = …)`.
 */
function visibleStates(visibility: QuizVisibility): readonly QuizState[] {
  return visibility.authorId === null && !visibility.isAdmin
    ? ['published']
    : ['draft', 'published', 'archived'];
}

interface QuizRowShape {
  readonly id: string;
  readonly authorId: string;
  readonly state: QuizState;
  readonly title: string;
  readonly description: string | null;
  readonly passThresholdPercent: number;
}

/**
 * Bản ghi quiz KÈM chủ sở hữu — dùng cho `assertContentOwner`.
 *
 * ⛔ Trả `authorId` ĐỌC TỪ DB, không phải từ input. Truyền `input.authorId` vào
 * một lượt kiểm quyền là tự kiểm một giá trị do kẻ tấn công cung cấp so với
 * chính nó (xem chú thích `assertContentOwner`).
 */
export async function findQuizForWrite(
  db: Database,
  quizId: string,
): Promise<QuizRowShape | null> {
  const [row] = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  return row ?? null;
}

export async function quizIdTaken(db: Database, quizId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);
  return row !== undefined;
}

/** Danh sách quiz của MỘT tác giả (trang soạn). */
export async function listQuizzesAuthoredBy(
  db: Database,
  authorId: string,
  limit: number,
): Promise<readonly (QuizSummary & { state: QuizState })[]> {
  const rows = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.authorId, authorId))
    .orderBy(asc(quizzes.id))
    .limit(limit);
  return withQuestionCounts(db, rows);
}

/**
 * Danh sách quiz ĐÃ XUẤT BẢN (trang người học).
 *
 * D9/C4 (phase-13) — `nextCursor` THẬT: `WHERE id > cursor … LIMIT limit+1`,
 * cùng khuôn `listItemsPage` của `content/repository.ts`. Trả `hasMore` để
 * caller (`quiz.list`) không phải đếm lại.
 */
export async function listPublishedQuizzesPage(
  db: Database,
  limit: number,
  cursor: string | undefined,
): Promise<{ items: readonly (QuizSummary & { state: QuizState })[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(quizzes)
    .where(
      cursor === undefined
        ? eq(quizzes.state, 'published')
        : and(eq(quizzes.state, 'published'), gt(quizzes.id, cursor)),
    )
    .orderBy(asc(quizzes.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: await withQuestionCounts(db, page), hasMore };
}

/**
 * `questionCount` — TÍNH bằng một truy vấn đếm, không phải một cột (AC #2).
 *
 * Một lượt `select` cho cả trang thay vì N+1: danh sách bị cap 100 (luật 4) nên
 * `inArray` luôn bounded.
 */
async function withQuestionCounts(
  db: Database,
  rows: readonly QuizRowShape[],
): Promise<readonly (QuizSummary & { state: QuizState })[]> {
  if (rows.length === 0) {
    return [];
  }
  const questionRows = await db
    .select({ quizId: quizQuestions.quizId })
    .from(quizQuestions)
    .where(
      inArray(
        quizQuestions.quizId,
        rows.map((row) => row.id),
      ),
    );

  const counts = new Map<string, number>();
  for (const row of questionRows) {
    counts.set(row.quizId, (counts.get(row.quizId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    passThresholdPercent: row.passThresholdPercent,
    questionCount: counts.get(row.id) ?? 0,
    state: row.state,
  }));
}

/**
 * Quiz ĐẦY ĐỦ — kèm đáp án. ⛔ KHÔNG được trả thẳng cho client; đi qua
 * `toLearnerQuiz` trước khi rời server, trừ đường của tác giả (`quiz.edit`).
 *
 * `null` khi không tồn tại HOẶC người hỏi không được thấy nó. Không phân biệt
 * hai ca — cùng lý lẽ `assertContentOwner` dùng NOT_FOUND thay vì FORBIDDEN:
 * một người dò id quiz của người khác không cần biết id đó có tồn tại không.
 */
export async function loadQuizFull(
  db: Database,
  quizId: string,
  visibility: QuizVisibility,
): Promise<QuizFull | null> {
  const [row] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), inArray(quizzes.state, [...visibleStates(visibility)])))
    .limit(1);

  if (row === undefined) {
    return null;
  }
  // Tác giả (không phải admin) chỉ thấy quiz của CHÍNH mình ở trạng thái nháp.
  if (
    visibility.authorId !== null &&
    !visibility.isAdmin &&
    row.state !== 'published' &&
    row.authorId !== visibility.authorId
  ) {
    return null;
  }

  const questionRows = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(asc(quizQuestions.ordinal));

  const choiceRows =
    questionRows.length === 0
      ? []
      : await db
          .select()
          .from(quizChoices)
          .where(
            inArray(
              quizChoices.questionRowId,
              questionRows.map((question) => question.id),
            ),
          )
          .orderBy(asc(quizChoices.ordinal));

  const choicesByQuestion = new Map<string, typeof choiceRows>();
  for (const choice of choiceRows) {
    const bucket = choicesByQuestion.get(choice.questionRowId) ?? [];
    bucket.push(choice);
    choicesByQuestion.set(choice.questionRowId, bucket);
  }

  const questions: QuizQuestionFull[] = questionRows.map((question) => ({
    id: question.questionId,
    ordinal: question.ordinal,
    kind: question.kind,
    markdown: question.markdown,
    explanation: question.explanation,
    choices: (choicesByQuestion.get(question.id) ?? []).map((choice) => ({
      id: choice.choiceId,
      markdown: choice.markdown,
      isCorrect: choice.isCorrect,
    })),
  }));

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    passThresholdPercent: row.passThresholdPercent,
    multipleAnswerRule: QUIZ_MULTIPLE_ANSWER_RULE,
    questions,
  };
}

/**
 * Bóc đáp án — chỗ DUY NHẤT dựng `QuizForLearner`.
 *
 * ⛔ Kiểu trả về khai TƯỜNG MINH, và đó là điều làm hàm này thành một cổng thật:
 * thêm `isCorrect: choice.isCorrect` vào literal dưới đây cho lỗi
 * `Type 'boolean' is not assignable to type 'never'` — không phải một lượt
 * review may mắn bắt được, mà là `tsc` từ chối.
 */
export function toLearnerQuiz(quiz: QuizFull): QuizForLearner {
  const questions: QuizQuestionForLearner[] = quiz.questions.map((question) => ({
    id: question.id,
    ordinal: question.ordinal,
    kind: question.kind,
    markdown: question.markdown,
    choices: question.choices.map((choice) => ({
      id: choice.id,
      markdown: choice.markdown,
    })),
  }));

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    passThresholdPercent: quiz.passThresholdPercent,
    multipleAnswerRule: quiz.multipleAnswerRule,
    questions,
  };
}
