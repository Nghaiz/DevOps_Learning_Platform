import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import type { ProblemWithStats } from '@devops-platform/games';
import type { Database } from '../db/client';
import { problems } from '../db/schema';
import { toProblemDTO } from './dto';
import { revealedHintsForOne } from './reveals';
import { toAuthorProblem, toSolverProblem } from './solver';
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
): Promise<ProblemWithStats> {
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
      ? toAuthorProblem(problem)
      : toSolverProblem(problem, revealed),
    stats,
    viewerStatus,
  };
}
