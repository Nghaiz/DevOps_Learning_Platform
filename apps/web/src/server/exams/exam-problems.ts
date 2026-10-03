import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { GameId } from '@devops-platform/games';

import type { Database } from '../db/client';
import { problems, problemSubmissions } from '../db/schema';
import { attemptDeadline, type AttemptClock } from './clock';

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
 * `[started_at, attemptDeadline(attempt, closesAt)]`, hai đầu đều đóng — đúng
 * phép lọc mà `scoreboard.ts` dựng lại bằng SQL (`>= a.started_at` và
 * `<= least(started_at + duration, coalesce(closes_at, 'infinity'))`). Ở đây hạn
 * lấy từ `clock.ts` vì đã có sẵn lượt thi trong tay, nên không phải dựng lại phép
 * tính đó lần thứ ba. Hai chỗ phải đổi CÙNG NHAU; lệch nhau là dấu tích của sinh
 * viên và điểm của giảng viên nói hai điều khác nhau.
 *
 * Vì sao cửa sổ chứ không phải "mọi lượt `solved` của bài này": một sinh viên có
 * thể đã giải bài đó từ tuần trước, hoặc trong một kỳ thi khác. Lượt đó không
 * thuộc lượt thi này và không được hiện dấu tích ở đây.
 *
 * ⚠ `attempt = null` (chưa bắt đầu) ⇒ mọi bài `solved: false`, KHÔNG truy vấn
 * bảng nộp bài: chưa có cửa sổ thì không có lượt nộp nào thuộc về nó.
 *
 * ⚠ Mã không còn tra ra bài (bài đã bị xoá sau khi soạn đề — `problem_codes` là
 * mảng, không có khoá ngoại) bị BỎ QUA chứ không bịa tên hay `gameId`. Mã đó vẫn
 * nằm trong `exam.problemCodes`; ở đây không có gì đúng để trả cho nó.
 */
export async function listExamProblems(
  db: Database,
  input: {
    readonly problemCodes: readonly string[];
    /** Người đang xem — `ctx.user.id`, KHÔNG bao giờ từ input. */
    readonly userId: string;
    readonly attempt: AttemptClock | null;
    readonly closesAt: Date | null;
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

  const solved = input.attempt === null
    ? new Set<string>()
    : await solvedCodesInWindow(db, input.userId, codes, input.attempt, input.closesAt);

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
  userId: string,
  codes: readonly string[],
  attempt: AttemptClock,
  closesAt: Date | null,
): Promise<ReadonlySet<string>> {
  const rows = await db
    .selectDistinct({ code: problemSubmissions.problemCode })
    .from(problemSubmissions)
    .where(
      and(
        eq(problemSubmissions.userId, userId),
        inArray(problemSubmissions.problemCode, [...codes]),
        eq(problemSubmissions.solved, true),
        gte(problemSubmissions.submittedAt, attempt.startedAt),
        lte(problemSubmissions.submittedAt, attemptDeadline(attempt, closesAt)),
      ),
    );
  return new Set(rows.map((row) => row.code));
}
