import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { computeLabScore, computeLabStatus } from '@devops-platform/scenario/lab-score';
import { gradeQuiz } from '@devops-platform/scenario/quiz-score';
import { pathItemKey, type PathItemRef } from '@devops-platform/scenario/path-progress';
import type { QuizAnswerInput } from '@devops-platform/shared-types/quiz';
import type { Database } from '../db/client';
import {
  labAttempts,
  labTaskResults,
  progress,
  quizAnswers,
  quizAttempts,
} from '../db/schema';
import { requireLab } from '../labs/catalog';
import { scenarioSource } from '../lessons/catalog';
import { loadQuizFull } from '../quiz/repository';

/**
 * "Người học này đã ĐẠT item nào?" — nguồn duy nhất cho luật `sequential`
 * (P10 10.A task 4) và cho nhãn tiến độ của 10.E.
 *
 * ## Ba loại item, ba nguồn tiến độ khác nhau — và không có nguồn thứ tư
 *
 * | kind | đạt ⇔ | bảng |
 * |---|---|---|
 * | `lesson` | `progress.completed_at IS NOT NULL` | `progress` |
 * | `lab` | lượt thử đã nộp nào đó có `percent >= lab.passThresholdPercent` | `lab_attempts` + `lab_task_results` |
 * | `quiz` | lượt nộp nào đó có `percent >= quiz.passThresholdPercent` | `quiz_attempts` + `quiz_answers` |
 *
 * ⛔ CỐ Ý không có bảng `path_progress`. Một bảng như thế sẽ là bản sao thứ tư
 * của một sự thật đã có ba nguồn, và nó lệch ngay lần đầu tiên có người làm lại
 * một lab — trừ khi ta viết thêm cơ chế đồng bộ, tức là thêm chỗ để sai. Câu
 * hỏi "đã đạt chưa" được TÍNH lúc đọc, mỗi lần.
 *
 * ## Cái giá, và vì sao nó chấp nhận được
 *
 * Một lộ trình N item cần nạp N DTO bài (lab/quiz) để biết mốc đạt của từng
 * cái. `paths.get` cap danh sách ở 100 (luật 4) nên N bounded, và nguồn đĩa
 * cache cả vòng đời tiến trình. Nếu về sau một lộ trình 100 item thành đường
 * nóng thật, chỗ tối ưu là gộp truy vấn — KHÔNG phải thêm một cột `passed`.
 */

/** `true` khi người học đã hoàn thành bài học (mốc `completedAt`). */
async function passedLessons(
  db: Database,
  userId: string,
  lessonIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (lessonIds.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ lessonId: progress.lessonId })
    .from(progress)
    .where(
      and(
        eq(progress.userId, userId),
        inArray(progress.lessonId, [...lessonIds]),
        isNotNull(progress.completedAt),
      ),
    );
  return new Set(rows.map((row) => row.lessonId));
}

/**
 * Lab ĐẠT ⇔ **có ít nhất một** lượt thử đã nộp đạt mốc.
 *
 * Không phải "lượt gần nhất": làm lại một lab đã đạt rồi bỏ dở không được biến
 * nó thành chưa-đạt, nhất là khi nó đang mở khoá item kế tiếp trong một lộ
 * trình `sequential`. Khoá một thứ người ta đã đạt là cách nhanh nhất để người
 * học tin hệ thống mất tiến độ của họ.
 */
async function passedLabs(
  db: Database,
  userId: string,
  labIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (labIds.length === 0) {
    return new Set();
  }

  const attempts = await db
    .select()
    .from(labAttempts)
    .where(
      and(
        eq(labAttempts.userId, userId),
        inArray(labAttempts.labId, [...labIds]),
        isNotNull(labAttempts.submittedAt),
      ),
    );
  if (attempts.length === 0) {
    return new Set();
  }

  const results = await db
    .select()
    .from(labTaskResults)
    .where(
      inArray(
        labTaskResults.attemptId,
        attempts.map((attempt) => attempt.id),
      ),
    );
  const resultsByAttempt = new Map<string, typeof results>();
  for (const result of results) {
    const bucket = resultsByAttempt.get(result.attemptId) ?? [];
    bucket.push(result);
    resultsByAttempt.set(result.attemptId, bucket);
  }

  const passed = new Set<string>();
  for (const attempt of attempts) {
    if (passed.has(attempt.labId)) {
      continue;
    }
    /**
     * Lab không nạp được (đã archive, hoặc id trong lộ trình gõ sai) ⇒ KHÔNG
     * đạt, không ném. Một mắt xích hỏng phải hiện ra là "chưa đạt / không có
     * tiêu đề", không được làm sập cả trang lộ trình.
     */
    const lab = await requireLab(attempt.labId).catch(() => null);
    if (lab === null) {
      continue;
    }
    const score = computeLabScore(
      lab,
      (resultsByAttempt.get(attempt.id) ?? []).map((row) => ({
        taskId: row.taskId,
        exitCode: row.exitCode,
        checkedAt: row.checkedAt,
      })),
    );
    if (computeLabStatus(lab, score, attempt.submittedAt) === 'passed') {
      passed.add(attempt.labId);
    }
  }
  return passed;
}

/** Quiz ĐẠT ⇔ có ít nhất một lượt nộp đạt mốc — cùng lý lẽ `passedLabs`. */
async function passedQuizzes(
  db: Database,
  userId: string,
  quizIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (quizIds.length === 0) {
    return new Set();
  }

  const attempts = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, userId), inArray(quizAttempts.quizId, [...quizIds])));
  if (attempts.length === 0) {
    return new Set();
  }

  const answers = await db
    .select()
    .from(quizAnswers)
    .where(
      inArray(
        quizAnswers.attemptId,
        attempts.map((attempt) => attempt.id),
      ),
    );
  const answersByAttempt = new Map<string, QuizAnswerInput[]>();
  for (const answer of answers) {
    const bucket = answersByAttempt.get(answer.attemptId) ?? [];
    bucket.push({
      questionId: answer.questionId,
      selectedChoiceIds: answer.selectedChoiceIds as string[],
    });
    answersByAttempt.set(answer.attemptId, bucket);
  }

  const passed = new Set<string>();
  for (const attempt of attempts) {
    if (passed.has(attempt.quizId)) {
      continue;
    }
    // Người học nên chỉ thấy quiz `published`; chấm lại cũng đi qua đúng tầm
    // nhìn đó, nên một quiz đã archive không âm thầm mở khoá gì.
    const quiz = await loadQuizFull(db, attempt.quizId, { authorId: null, isAdmin: false });
    if (quiz === null) {
      continue;
    }
    if (gradeQuiz(quiz, answersByAttempt.get(attempt.id) ?? []).score.passed) {
      passed.add(attempt.quizId);
    }
  }
  return passed;
}

/**
 * Tập khoá `kind:itemId` mà người học đã đạt.
 *
 * Khoá mang cả `kind` — một lesson và một quiz được phép trùng slug, và dùng
 * riêng `itemId` sẽ khiến "đã đạt lesson X" mở khoá luôn "quiz X" trong im
 * lặng (xem `pathItemKey`).
 */
export async function loadPassedItemKeys(
  db: Database,
  userId: string,
  refs: readonly PathItemRef[],
): Promise<ReadonlySet<string>> {
  const idsOf = (kind: PathItemRef['kind']): readonly string[] => [
    ...new Set(refs.filter((ref) => ref.kind === kind).map((ref) => ref.itemId)),
  ];

  const [lessons, labs, quizzes] = await Promise.all([
    passedLessons(db, userId, idsOf('lesson')),
    passedLabs(db, userId, idsOf('lab')),
    passedQuizzes(db, userId, idsOf('quiz')),
  ]);

  const keys = new Set<string>();
  for (const id of lessons) {
    keys.add(pathItemKey({ kind: 'lesson', itemId: id }));
  }
  for (const id of labs) {
    keys.add(pathItemKey({ kind: 'lab', itemId: id }));
  }
  for (const id of quizzes) {
    keys.add(pathItemKey({ kind: 'quiz', itemId: id }));
  }
  return keys;
}

/**
 * Tiêu đề của từng item, nạp từ NGUỒN của nó lúc đọc.
 *
 * `null` cho item không nạp được — hiện ra thay vì lọc đi, để người soạn thấy
 * lộ trình đang thủng một mắt xích (xem `learningPathItemViewSchema.title`).
 */
export async function loadItemTitles(
  db: Database,
  refs: readonly PathItemRef[],
): Promise<ReadonlyMap<string, string | null>> {
  const titles = new Map<string, string | null>();

  await Promise.all(
    refs.map(async (ref) => {
      const key = pathItemKey(ref);
      if (titles.has(key)) {
        return;
      }
      switch (ref.kind) {
        case 'lesson': {
          const scenario = await scenarioSource()
            .get(ref.itemId)
            .catch(() => null);
          titles.set(key, scenario?.title ?? null);
          return;
        }
        case 'lab': {
          const lab = await requireLab(ref.itemId).catch(() => null);
          titles.set(key, lab?.title ?? null);
          return;
        }
        case 'quiz': {
          const quiz = await loadQuizFull(db, ref.itemId, { authorId: null, isAdmin: false });
          titles.set(key, quiz?.title ?? null);
          return;
        }
      }
    }),
  );

  return titles;
}
