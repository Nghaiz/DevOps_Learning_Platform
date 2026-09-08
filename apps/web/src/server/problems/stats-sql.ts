import { eq, sql } from 'drizzle-orm';
import type { ProblemStats, ProblemViewerStatus } from '@devops-platform/games';
import type { Database } from '../db/client';
import { problemSubmissions } from '../db/schema';

/**
 * Số liệu của bài, GỘP TỪ `problem_submissions` — không có cột nào lưu sẵn.
 *
 * `problem.ts` § `ProblemStats` viết rõ vì sao: một cột `solver_count` phải
 * được giữ đồng bộ mãi mãi bằng trigger hay cron, và nó sẽ lệch. Ở đây phép gộp
 * chạy trong một truy vấn con rồi `LEFT JOIN` vào `problems`, nên một bài chưa
 * ai nộp vẫn ra dòng với `null` — chỗ dùng `coalesce` về 0.
 *
 * ⚠ `::int` KHÔNG phải trang trí. `count()` của Postgres trả `bigint`, và driver
 * `postgres` đưa `int8` về JavaScript dưới dạng CHUỖI (số nguyên 64 bit không
 * lọt vào `number` an toàn nên nó không dám tự ép). Không có cast thì
 * `attemptCount` là `"3"` chứ không phải `3`, kiểu TypeScript vẫn nói `number`,
 * và chỗ vỡ là phép chia `solverCount / attemptCount` — ra `NaN` hoặc, tệ hơn,
 * ra đúng nhờ ép ngầm ở một chỗ và sai ở chỗ khác. `.mapWith(Number)` của
 * Drizzle không cứu được ở đây vì phép ánh xạ đó mất khi cột đi qua một truy vấn
 * con rồi được chọn lại ở truy vấn ngoài.
 *
 * `filter (where solved)` thay vì `sum(case when …)`: nó nói đúng ý định, và
 * `count(distinct …)` bên trong `filter` mới đếm ĐÚNG NGƯỜI — `sum` sẽ đếm số
 * lần nộp thành công, tức một người giải mười lần thành mười người giải.
 */
export function problemStatsSubquery(db: Database) {
  return db
    .select({
      problemCode: problemSubmissions.problemCode,
      attemptCount: sql<number>`(count(distinct ${problemSubmissions.userId}))::int`.as(
        'attempt_count',
      ),
      solverCount:
        sql<number>`(count(distinct ${problemSubmissions.userId}) filter (where ${problemSubmissions.solved}))::int`.as(
          'solver_count',
        ),
    })
    .from(problemSubmissions)
    .groupBy(problemSubmissions.problemCode)
    .as('problem_stats');
}

/**
 * Quan hệ của NGƯỜI ĐANG XEM với từng bài, cũng gộp từ chính bảng nộp bài.
 *
 * Một truy vấn con riêng chứ không gộp chung với truy vấn trên: truy vấn trên
 * gộp trên MỌI người, còn cái này lọc theo đúng một người trước khi gộp. Nhét
 * cả hai vào một phép gộp sẽ cần `filter (where user_id = $1)` trên từng cột và
 * làm câu SQL khó đọc hơn hẳn phần nó tiết kiệm được.
 *
 * Không có dòng ⇒ `untouched`. Có dòng mà `bool_or(solved)` sai ⇒ `attempted`.
 */
export function viewerStatusSubquery(db: Database, viewerId: string) {
  return db
    .select({
      problemCode: problemSubmissions.problemCode,
      solved: sql<boolean>`bool_or(${problemSubmissions.solved})`.as('viewer_solved'),
    })
    .from(problemSubmissions)
    .where(eq(problemSubmissions.userId, viewerId))
    .groupBy(problemSubmissions.problemCode)
    .as('viewer_stats');
}

/**
 * `acceptanceRate` TÍNH tại đây, đúng một chỗ.
 *
 * Hợp đồng gọi nó là trường tệ nhất trong ba: nó suy ra được từ hai trường kia,
 * nên lưu nó là lưu cùng một sự thật ba lần. Chưa ai thử ⇒ 0, không phải `NaN`
 * — một `NaN` đi qua JSON thành `null` và chỗ vỡ nằm ở tầng hiển thị, cách xa
 * phép chia đã sinh ra nó.
 */
export function toProblemStats(attemptCount: number, solverCount: number): ProblemStats {
  return {
    attemptCount,
    solverCount,
    acceptanceRate: attemptCount === 0 ? 0 : solverCount / attemptCount,
  };
}

/** `null` từ `LEFT JOIN` = chưa từng nộp. Ba nhánh, không có nhánh ngầm. */
export function toViewerStatus(solved: boolean | null): ProblemViewerStatus {
  if (solved === null) {
    return 'untouched';
  }
  return solved ? 'solved' : 'attempted';
}
