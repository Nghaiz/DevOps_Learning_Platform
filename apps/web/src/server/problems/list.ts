import { asc, desc, eq, getTableColumns, isNull, or, sql, type SQL } from 'drizzle-orm';
import type {
  ProblemListOptions,
  ProblemOrderKey,
  ProblemPage,
  ProblemWithStats,
} from '@devops-platform/games';
import type { Database } from '../db/client';
import { problems } from '../db/schema';
import { MAX_LIST_LIMIT } from '../trpc/init';
import { decodeProblemCursor, encodeProblemCursor } from './cursor';
import { toProblemDTO } from './dto';
import { afterCursorWhere, filterWhere } from './list-where';
import { revealedHintsFor } from './reveals';
import { toSolverProblem } from './solver';
import { problemStatsSubquery, toProblemStats, toViewerStatus, viewerStatusSubquery } from './stats-sql';
import {
  allOf,
  intersectStates,
  stateWhere,
  visibleProblemWhere,
  type ProblemVisibility,
} from './visibility';

const DEFAULT_LIMIT = 20;

export interface ListProblemsInput {
  readonly visibility: ProblemVisibility;
  /** Luôn có: mọi procedure của `problems.*` là `protectedProcedure`. */
  readonly viewerId: string;
  readonly options: ProblemListOptions;
  /** Trang soạn: chỉ bài của tác giả này. `null` = catalog. */
  readonly authorScope?: string | null;
}

/**
 * Danh sách bài — lọc, sắp, phân trang keyset, kèm số liệu gộp.
 *
 * Một truy vấn duy nhất cho cả ba việc, nhờ hai truy vấn con `LEFT JOIN` vào:
 * `problem_stats` (gộp trên mọi người) và `viewer_stats` (gộp riêng người đang
 * xem). Đó cũng là lý do keyset trên `solverCount` làm được: cột gộp có mặt như
 * một cột của quan hệ đã join, nên `WHERE` tham chiếu được nó — điều không làm
 * được nếu nó chỉ là một bí danh trong danh sách `SELECT`.
 */
export async function listProblems(db: Database, input: ListProblemsInput): Promise<ProblemPage> {
  const { options } = input;
  const orderBy: ProblemOrderKey = options.orderBy ?? 'code';
  const direction = options.direction ?? 'asc';
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIST_LIMIT);

  const states = intersectStates(input.visibility, options.filter?.state);
  if (states === null) {
    // Giao của "state người gọi xin" và "state họ được thấy" là rỗng — ví dụ một
    // người học lọc `['draft']`. Trả trang rỗng, KHÔNG trả lỗi: một lỗi ở đây sẽ
    // xác nhận rằng có bản nháp tồn tại, và đó chính là thứ `draft` phải giấu.
    return { items: [], nextCursor: null };
  }

  const stats = problemStatsSubquery(db);
  const viewer = viewerStatusSubquery(db, input.viewerId);
  const solverCountExpr = sql<number>`coalesce(${stats.solverCount}, 0)`;
  const sortExpr = sortExpression(orderBy, solverCountExpr);

  const where = allOf([
    // ⛔ HAI mệnh đề, không phải một, và ô test `tác giả KHÁC cũng không thấy
    // draft của người này` đã bắt được đúng chỗ thiếu một trong hai (2026-09-08).
    //
    //  · `visibleProblemWhere` gác QUYỀN SỞ HỮU: `published` của mọi người, cộng
    //    bài của chính mình. Thiếu nó thì `intersectStates` trả về đủ ba state
    //    cho MỌI `author`, và mỗi tác giả đọc được bản nháp của mọi tác giả khác.
    //  · `stateWhere` gác STATE NGƯỜI GỌI XIN, đã giao với state họ được thấy.
    //
    // Cái thứ nhất trông như đã bao hàm cái thứ hai vì với người học chúng trùng
    // nhau — và đó chính là lý do thiếu sót kia không lộ ra ở đường của người học.
    visibleProblemWhere(input.visibility),
    stateWhere(states),
    input.authorScope === undefined || input.authorScope === null
      ? undefined
      : eq(problems.authorId, input.authorScope),
    ...filterWhere(options.filter),
    viewerStatusWhere(options.filter?.viewerStatus, viewer),
    options.cursor === undefined || options.cursor === null
      ? undefined
      : afterCursorWhere(orderBy, direction, sortExpr, decodeProblemCursor(options.cursor, orderBy)),
  ]);

  const towards = direction === 'asc' ? asc : desc;
  const rows = await db
    .select({
      ...getTableColumns(problems),
      attemptCount: sql<number>`coalesce(${stats.attemptCount}, 0)`,
      solverCount: solverCountExpr,
      viewerSolved: viewer.solved,
    })
    .from(problems)
    .leftJoin(stats, eq(stats.problemCode, problems.code))
    .leftJoin(viewer, eq(viewer.problemCode, problems.code))
    .where(where)
    // Tie-break `code` ở MỌI khoá, kể cả khi `orderBy === 'code'` (lúc đó nó
    // trùng vế đầu và Postgres bỏ qua vế thừa). Một `ORDER BY` không toàn phần
    // cho phép Postgres trả thứ tự bất kỳ giữa các dòng bằng nhau — và con trỏ
    // keyset khi ấy mất nghĩa.
    .orderBy(towards(sortExpr), towards(problems.code))
    // +1 để biết CÓ trang sau hay không mà không phải chạy một `count(*)` thứ
    // hai trên cùng bộ lọc.
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const revealed = await revealedHintsFor(
    db,
    input.viewerId,
    page.map((row) => row.code),
  );

  const items: ProblemWithStats[] = page.map((row) => ({
    problem: toSolverProblem(toProblemDTO(row), revealed.get(row.code) ?? new Set<string>()),
    stats: toProblemStats(row.attemptCount, row.solverCount),
    viewerStatus: toViewerStatus(row.viewerSolved),
  }));

  const last = page[page.length - 1];
  return {
    items,
    nextCursor: hasMore && last !== undefined ? encodeProblemCursor(orderBy, last) : null,
  };
}

/**
 * Biểu thức sắp xếp, đã bọc thành `SQL` cho cả bốn khoá.
 *
 * Bọc đồng nhất chứ không trả `Column | SQL`: `afterCursorWhere` phải so sánh
 * trên ĐÚNG biểu thức mà `ORDER BY` dùng, và một kiểu liên hợp ở đó buộc phải
 * ép kiểu ở mỗi lần gọi `gt`/`lt` — mỗi lần ép là một chỗ để hai vế lệch nhau
 * mà trình biên dịch không nói gì.
 *
 * ⛔ Không có `title`, và `PROBLEM_ORDER_KEYS` đã trả giá cho điều đó: Postgres
 * và JavaScript không cùng thứ tự với tiếng Việt có dấu, nên `ORDER BY title`
 * cho một thứ tự ở DB và một thứ tự khác khi tầng web sắp lại — với keyset thì
 * lệch thứ tự nghĩa là MẤT DÒNG.
 */
function sortExpression(orderBy: ProblemOrderKey, solverCountExpr: SQL<number>): SQL {
  switch (orderBy) {
    case 'code':
      return sql`${problems.code}`;
    // Postgres sắp enum theo thứ tự KHAI BÁO của kiểu, tức `easy < medium < hard
    // < expert` đúng như `PROBLEM_DIFFICULTIES`. Không dựng lại thứ hạng bằng
    // `CASE` ở đây: con trỏ mã hoá chính giá trị enum, nên `ORDER BY` và `>`
    // dùng chung một bộ so sánh — của Postgres, một mình.
    case 'difficulty':
      return sql`${problems.difficulty}`;
    case 'solverCount':
      return sql`${solverCountExpr}`;
    case 'createdAt':
      return sql`${problems.createdAt}`;
  }
}

/**
 * Quan hệ của người xem → mệnh đề trên truy vấn con đã join.
 *
 * Nhiều giá trị = HOẶC: chọn cả `solved` lẫn `attempted` nghĩa là "mọi bài tôi
 * đã đụng tới". `untouched` là `LEFT JOIN` không khớp dòng nào, nên nó kiểm
 * `IS NULL` trên khoá join chứ không kiểm cột `solved` — một bài chưa nộp lần
 * nào có `solved` là `NULL`, và `NULL = false` cho ra `NULL` chứ không cho ra
 * `true`, tức nhánh viết nhầm sẽ im lặng trả về rỗng.
 */
function viewerStatusWhere(
  statuses: readonly string[] | undefined,
  viewer: ReturnType<typeof viewerStatusSubquery>,
): SQL | undefined {
  if (statuses === undefined || statuses.length === 0) {
    return undefined;
  }
  const parts: SQL[] = [];
  if (statuses.includes('untouched')) {
    parts.push(isNull(viewer.problemCode));
  }
  if (statuses.includes('solved')) {
    parts.push(eq(viewer.solved, true));
  }
  if (statuses.includes('attempted')) {
    parts.push(eq(viewer.solved, false));
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.length === 1 ? parts[0] : (or(...parts) as SQL);
}
