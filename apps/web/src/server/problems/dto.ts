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

export function toSubmissionDTO(row: ProblemSubmissionRow): ProblemSubmission {
  return {
    id: row.id,
    problemCode: row.problemCode,
    userId: row.userId,
    solved: row.solved,
    score: row.score,
    durationSeconds: row.durationSeconds,
    movesUsed: row.movesUsed,
    hintsRevealed: row.hintsRevealed,
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
