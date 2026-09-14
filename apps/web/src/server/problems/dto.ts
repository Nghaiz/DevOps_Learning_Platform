import type { Problem, ProblemHint, ProblemSubmission } from '@devops-platform/games';
import type { ProblemRow, ProblemSubmissionRow } from '../db/schema';

/**
 * Dòng DB → DTO đi qua dây.
 *
 * `toISOString()` KHÔNG phải trang trí: client tRPC của app này cố ý không có
 * transformer, nên một `Date` trả thẳng ra sẽ tới trình duyệt dưới dạng CHUỖI
 * trong khi kiểu suy ra vẫn nói `Date` — hợp đồng nói dối, và chỗ vỡ nằm ở call
 * site đầu tiên gọi `.getTime()`. Cùng khuôn `toLabTaskResultDTO` của `labs.ts`,
 * và đó là lý do `Problem.createdAt` khai `string` chứ không phải `Date`.
 */
export function toProblemDTO(row: ProblemRow): Problem {
  return {
    code: row.code,
    slug: row.slug,
    title: row.title,
    statement: row.statement,
    difficulty: row.difficulty,
    topics: row.topics,
    tags: row.tags,
    timeLimitSec: row.timeLimitSec,
    initialState: row.initialState,
    objectives: row.objectives,
    allowedResources: row.allowedResources,
    hints: row.hints,
    parMoves: row.parMoves,
    state: row.state,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `ProblemSubmission` + mô hình testcase (§18.B.2).
 *
 * ⚠ KHE TRONG HỢP ĐỒNG, đã báo lead — đây là chỗ nó lộ ra. `core/problem.ts` §
 * `Submission` KHAI `passed`/`total`, nhưng `k8s/problem.ts` §
 * `ProblemSubmission` (kiểu mà tầng web thật sự đi qua dây) thì KHÔNG. Hai kiểu
 * mô tả cùng một thứ và đã lệch nhau. Lane này không sở hữu `packages/games`
 * nên mở rộng tại biên web thay vì sửa hợp đồng sau lưng lead.
 *
 * `extends` chứ không phải một kiểu mới: mọi chỗ đang nhận `ProblemSubmission`
 * vẫn nhận được, nên phần mở rộng không bắt ai đổi gì.
 *
 * ⛔ KHÔNG thêm một trường `verdict` ở đây. Verdict suy được từ `(passed, total)`
 * qua `problemVerdictOf`, và gửi kèm nó là gửi cùng một sự thật hai lần —
 * `gradeFromSubmission` ở `verdict-view.ts` là chỗ suy DUY NHẤT.
 */
export interface ProblemSubmissionWithGrade extends ProblemSubmission {
  /** Id các testcase đã qua. Rỗng ở lượt `CE`. */
  readonly passed: readonly string[];
  /** Số testcase của bài LÚC NỘP — sự thật lịch sử, xem chú thích cột ở `schema.ts`. */
  readonly total: number;
}

export function toSubmissionDTO(row: ProblemSubmissionRow): ProblemSubmissionWithGrade {
  return {
    id: row.id,
    problemCode: row.problemCode,
    userId: row.userId,
    solved: row.solved,
    score: row.score,
    durationSeconds: row.durationSeconds,
    movesUsed: row.movesUsed,
    hintsRevealed: row.hintsRevealed,
    passed: row.passed,
    total: row.total,
    submittedAt: row.submittedAt.toISOString(),
  };
}

/**
 * Tra một gợi ý theo id.
 *
 * Trả `null` thay vì ném: chỗ gọi (`revealHint`) cần phân biệt "không có bài đó"
 * với "có bài nhưng không có gợi ý id đó", và hai thứ là hai thông báo khác nhau
 * cho người dùng — cái đầu nghĩa là sai đường dẫn, cái sau nghĩa là giao diện
 * đang giữ một bản đề đã cũ.
 */
export function findHint(hints: readonly ProblemHint[], hintId: string): ProblemHint | null {
  return hints.find((hint) => hint.id === hintId) ?? null;
}
