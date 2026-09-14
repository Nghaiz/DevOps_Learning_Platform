import type {
  ProblemBase,
  ProblemHint,
  ProblemSubmission,
  ResourceKind,
} from '@devops-platform/games';
import type { ProblemRow, ProblemSubmissionRow } from '../db/schema';
import { problemTestcases } from './testcases';

/**
 * Một bài như KHO LƯU giữ nó — game-neutral, §18.A hoàn tất ở tầng dưới cùng.
 *
 * ## Vì sao kiểu này ở `apps/web` chứ không ở `packages/games/src/core/`
 *
 * Vì `allowedResources`. Nó là kiểu `ResourceKind` của K8s, và ô nghiệm thu AC-A
 * đo bằng `grep -rn "from '\.\./k8s\|from '\.\./git" packages/games/src/core/`
 * — đặt trường này vào một kiểu trong `core/` là tự làm ô đó đỏ, và đỏ vì đúng
 * lý do: `core/` mà biết `ResourceKind` thì "OJ đa-game" lại sai ở tầng miền.
 *
 * Tầng DTO của `apps/web` thì ĐƯỢC biết K8s — nó là ứng dụng, không phải thư
 * viện dùng chung. Nên phần chung lấy từ `ProblemBase<unknown>` của hợp đồng, và
 * phần riêng K8s giao nhau ở đây.
 *
 * ## ⚠ NỢ ĐÃ GHI TÊN: `allowedResources` là cột của thời K8s-một-game
 *
 * Một bài Git mang `allowedResources: null` vĩnh viễn — trường này không có
 * nghĩa nào với nó. Chỗ đúng của nó là bên trong `initial_state` (phần spec
 * riêng của K8s) hoặc trong `authorFields` của plugin K8s, đúng như §18.A.3 đã
 * vạch. Không chuyển trong lượt này vì đó là một migration DỮ LIỆU trên mọi
 * dòng đang có, và nó không chặn việc gì — `null` cho game khác đọc ra đúng
 * nghĩa "không áp dụng". Ghi ra đây thay vì để người sau tưởng đó là thiết kế.
 *
 * ## `initialState: unknown` là chủ ý
 *
 * Kiểu đúng phụ thuộc `gameId` của chính dòng đó; xem khối chú thích cột
 * `initial_state` ở `schema.ts`. Chỗ hẹp lại là `gradeProblemRun`, sau khi tra
 * plugin.
 */
export type StoredProblem = ProblemBase<unknown> & {
  /** ⚠ K8s-only. `null` với mọi game khác — xem khối nợ ở trên. */
  readonly allowedResources: readonly ResourceKind[] | null;
};

/**
 * Dòng DB → DTO đi qua dây.
 *
 * `toISOString()` KHÔNG phải trang trí: client tRPC của app này cố ý không có
 * transformer, nên một `Date` trả thẳng ra sẽ tới trình duyệt dưới dạng CHUỖI
 * trong khi kiểu suy ra vẫn nói `Date` — hợp đồng nói dối, và chỗ vỡ nằm ở call
 * site đầu tiên gọi `.getTime()`. Cùng khuôn `toLabTaskResultDTO` của `labs.ts`,
 * và đó là lý do `ProblemBase.createdAt` khai `string` chứ không phải `Date`.
 *
 * ⛔ `testcases` đi qua `problemTestcases`, KHÔNG gán thẳng `row.objectives`.
 * Cột đó là jsonb và kiểu của nó là một LỜI KHAI chứ không phải một phép kiểm:
 * dòng viết trước 18.B mang `required` và không mang `visible`. Biên đọc là chỗ
 * duy nhất biến hình dạng lịch sử thành hợp đồng hôm nay, và bỏ qua nó nghĩa là
 * `visible` của dòng cũ ra `undefined` — tức mọi testcase cũ thành ẩn, im lặng.
 */
export function toProblemDTO(row: ProblemRow): StoredProblem {
  return {
    code: row.code,
    gameId: row.gameId,
    slug: row.slug,
    title: row.title,
    statement: row.statement,
    difficulty: row.difficulty,
    topics: row.topics,
    tags: row.tags,
    timeLimitSec: row.timeLimitSec,
    initialState: row.initialState,
    ...(row.targetState === null ? {} : { targetState: row.targetState }),
    testcases: problemTestcases(row.objectives),
    allowedResources: row.allowedResources,
    hints: row.hints,
    parMoves: row.parMoves,
    seedable: row.seedable,
    state: row.state,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Dòng `problem_submissions` → DTO đi qua dây (§18.B.2).
 *
 * ⛔ ĐÃ ĐÓNG 2026-09-14, giữ lại vì nó giải thích một kiểu vừa BIẾN MẤT. Bản
 * trước của file này khai `ProblemSubmissionWithGrade extends ProblemSubmission`
 * để thêm `passed`/`total` tại biên web, vì `k8s/problem.ts` §
 * `ProblemSubmission` chưa có hai trường đó trong khi `core/problem.ts` §
 * `Submission` đã có. Đó là một khe trong hợp đồng, và cái `extends` chỉ là băng
 * dán của lane không sở hữu `packages/games`.
 *
 * Khe đã được vá ở đúng chỗ của nó: `ProblemSubmission` nay khai `passed`/`total`.
 * Kiểu mở rộng vì thế không còn lý do tồn tại, và giữ nó lại sẽ thành một tên
 * thứ hai cho cùng một hình dạng, tức đúng thứ § SSOT của
 * `rules/development-principles.md` cấm.
 *
 * ⛔ KHÔNG thêm một trường `verdict` vào đây. Verdict suy được từ
 * `(passed.length, total)` qua `problemVerdictOf`, nên gửi kèm nó là gửi cùng
 * một sự thật hai lần. `gradeFromSubmission` là chỗ suy DUY NHẤT.
 */
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
    passed: row.passed,
    total: row.total,
    // Đi thẳng, KHÔNG suy lại từ `(passed, total)`: cả điểm của cột này là hai
    // thứ đó không phân biệt nổi một `CE` thật với một `WA (0/n)` thật. Xem
    // `core/problem.ts` § `PROBLEM_FAILURE_CODES`.
    failedCode: row.failCode,
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
