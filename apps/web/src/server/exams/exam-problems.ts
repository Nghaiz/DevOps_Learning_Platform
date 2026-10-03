import { and, eq, inArray } from 'drizzle-orm';
import type { GameId } from '@devops-platform/games';

import type { Database } from '../db/client';
import { examAttempts, exams, problems, problemSubmissions } from '../db/schema';
import { inScoringWindow } from './scoring-window';

/**
 * Danh sách bài của MỘT kỳ thi như người học thấy trong màn làm bài
 * (`examSitting.get`), theo đúng thứ tự người ra đề xếp.
 *
 * Tồn tại để màn làm bài không phải tra `problems.byCode` một lượt cho mỗi mã
 * chỉ để lấy tên và `gameId` (nhằm mở thẳng vào đúng game).
 */
export interface ExamProblemView {
  readonly code: string;
  readonly title: string;
  readonly gameId: GameId;
  /**
   * Có ít nhất một lượt nộp `solved` của CHÍNH người xem, nằm trong cửa sổ của
   * CHÍNH lượt thi này.
   *
   * "AC" ở đây là cột `problem_submissions.solved` — cùng cột mà bảng điểm kỳ thi
   * (`scoreboard.ts`, `ExamScoreCell.solved` / `solvedCount`), CSV ("solved ⇒ AC")
   * và `viewerStatus: 'solved'` của kho bài cùng đọc. Dùng một định nghĩa khác ở
   * đây thì sinh viên thấy dấu tích mà giảng viên không thấy điểm, hoặc ngược lại.
   */
  readonly solved: boolean;
}

/**
 * ## Cửa sổ của lượt thi — CÙNG cửa sổ với bảng điểm
 *
 * `[started_at, least(submitted_at, hạn)]` — lọc bằng ĐÚNG mảnh SQL mà
 * `scoreboard.ts` dùng (`inScoringWindow`, `scoring-window.ts`), nên dấu tích của
 * sinh viên và điểm của giảng viên không thể nói hai điều khác nhau. Lượt giải
 * SAU khi bấm nộp thì không có dấu tích, dù còn trước hạn.
 *
 * Vì sao cửa sổ chứ không phải "mọi lượt `solved` của bài này": một sinh viên có
 * thể đã giải bài đó từ tuần trước, hoặc trong một kỳ thi khác. Lượt đó không
 * thuộc lượt thi này và không được hiện dấu tích ở đây.
 *
 * ⚠ Chưa bắt đầu ⇒ không có dòng `exam_attempts` để join ⇒ mọi bài
 * `solved: false`: chưa có cửa sổ thì không có lượt nộp nào thuộc về nó.
 *
 * ⚠ Mã không còn tra ra bài (bài đã bị xoá sau khi soạn đề — `problem_codes` là
 * mảng, không có khoá ngoại) bị BỎ QUA chứ không bịa tên hay `gameId`. Mã đó vẫn
 * nằm trong `exam.problemCodes`; ở đây không có gì đúng để trả cho nó.
 */
export async function listExamProblems(
  db: Database,
  input: {
    readonly examId: string;
    readonly problemCodes: readonly string[];
    /** Người đang xem — `ctx.user.id`, KHÔNG bao giờ từ input. */
    readonly userId: string;
  },
): Promise<readonly ExamProblemView[]> {
  const codes = [...new Set(input.problemCodes)];
  if (codes.length === 0) {
    return [];
  }

  // Chỉ ba cột: tên, game, mã. Đề bài, testcase và gợi ý KHÔNG đi qua đây —
  // màn làm bài mở bài bằng `problems.byCode`, nơi đã có sẵn phép che.
  const rows = await db
    .select({ code: problems.code, title: problems.title, gameId: problems.gameId })
    .from(problems)
    .where(inArray(problems.code, codes));
  const byCode = new Map(rows.map((row) => [row.code, row]));

  const solved = await solvedCodesInWindow(db, input.examId, input.userId, codes);

  const views: ExamProblemView[] = [];
  for (const code of input.problemCodes) {
    const row = byCode.get(code);
    if (row === undefined) {
      continue;
    }
    views.push({ code, title: row.title, gameId: row.gameId, solved: solved.has(code) });
  }
  return views;
}

async function solvedCodesInWindow(
  db: Database,
  examId: string,
  userId: string,
  codes: readonly string[],
): Promise<ReadonlySet<string>> {
  // `exam_attempts` và `exams` join KHÔNG bí danh: `inScoringWindow` tham chiếu
  // chúng bằng tên bảng.
  const rows = await db
    .selectDistinct({ code: problemSubmissions.problemCode })
    .from(problemSubmissions)
    .innerJoin(
      examAttempts,
      and(eq(examAttempts.examId, examId), eq(examAttempts.userId, problemSubmissions.userId)),
    )
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .where(
      and(
        eq(problemSubmissions.userId, userId),
        inArray(problemSubmissions.problemCode, [...codes]),
        eq(problemSubmissions.solved, true),
        inScoringWindow(problemSubmissions.submittedAt),
      ),
    );
  return new Set(rows.map((row) => row.code));
}
