import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import type { ProblemViewerStatus } from '@devops-platform/games';
import type { Database } from '../db/client';
import { problems } from '../db/schema';
import { toProblemDTO } from './dto';
import { revealedHintsForOne } from './reveals';
import { toAuthorProblem, toSolverProblem, type SolverProblemWithStats } from './solver';
import { problemStats, viewerStatusFor } from './stats';
import { canReadHintText, visibleProblemWhere, type ProblemVisibility } from './visibility';

/**
 * Một bài theo mã, đã áp tầm nhìn.
 *
 * ⛔ Đây là chỗ hợp đồng *"`draft` không hiện với người học, kể cả khi biết
 * URL"* được thi hành. Mệnh đề tầm nhìn nằm TRONG câu `WHERE`, không phải một
 * phép kiểm sau khi đã đọc dòng ra — hai cách cho cùng kết quả hôm nay, nhưng
 * cách thứ hai để lại một biến chứa nội dung bài `draft` trong tầm với của mọi
 * dòng viết sau nó, và một `return` đặt nhầm chỗ là đủ để rò.
 *
 * `NOT_FOUND` chứ không `FORBIDDEN`: `FORBIDDEN` xác nhận rằng bài đó TỒN TẠI,
 * và một người dò mã bài chưa xuất bản không cần biết điều đó.
 */
export async function getProblemForViewer(
  db: Database,
  visibility: ProblemVisibility,
  viewerId: string,
  code: string,
): Promise<SolverProblemWithStats> {
  const rows = await db
    .select()
    .from(problems)
    .where(and(eq(problems.code, code), visibleProblemWhere(visibility)))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
  }

  const problem = toProblemDTO(row);
  const [stats, viewerStatus, revealed] = await Promise.all([
    problemStats(db, code),
    viewerStatusFor(db, code, viewerId),
    revealedHintsForOne(db, viewerId, code),
  ]);

  return {
    // Hai nhánh có TÊN khác nhau chứ không phải một hàm nhận cờ boolean: nhánh
    // che và nhánh không che là hai quyết định bảo mật khác nhau, và một `if`
    // trên một tham số `redact: boolean` là chỗ mà lần "đơn giản hoá" sau sẽ gộp
    // nhầm.
    problem: canReadHintText(visibility, row.authorId)
      // `revealed` vẫn đi qua BẢNG kể cả ở nhánh này — tác giả đọc được `text`
      // mà chưa trả điểm, và phép tính điểm đọc cờ kia. Xem `toAuthorProblem`.
      ? toAuthorProblem(problem, revealed)
      // §18.B.4 — nhãn testcase ẩn chỉ mở SAU KHI NỘP, và "đã nộp" đọc từ
      // `viewerStatus` mà máy chủ vừa gộp ra từ bảng `problem_submissions`.
      // KHÔNG có đường nào cho client tự khai điều này.
      : toSolverProblem(problem, revealed, hasSubmitted(viewerStatus)),
    stats,
    viewerStatus,
  };
}

/**
 * Người này đã nộp bài lần nào chưa — §18.B.4.
 *
 * `attempted` cũng tính, không chỉ `solved`: hợp đồng nói nhãn testcase ẩn mở
 * *"sau khi nộp"*, không phải *"sau khi giải được"*. Bắt phải giải xong mới cho
 * xem nhãn là giữ kín đúng thứ người đang trượt cần để biết mình trượt ở đâu.
 */
function hasSubmitted(viewerStatus: ProblemViewerStatus | null): boolean {
  return viewerStatus === 'solved' || viewerStatus === 'attempted';
}
