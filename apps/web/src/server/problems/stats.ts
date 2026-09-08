import { and, eq, sql } from 'drizzle-orm';
import type { ProblemStats, ProblemViewerStatus } from '@devops-platform/games';
import type { DbOrTx } from '../db/client';
import { problemSubmissions } from '../db/schema';
import { toProblemStats, toViewerStatus } from './stats-sql';

/**
 * Số liệu của MỘT bài, gộp tại chỗ dùng.
 *
 * ⛔ Không đọc cột nào cả — bảng `problems` cố ý không có `solver_count`,
 * `attempt_count`, `acceptance_rate`. `problem.ts` § `ProblemStats` gọi đó là
 * chỗ mọi thiết kế OJ đều trượt: thêm cột cho "truy vấn nhanh" rồi vĩnh viễn
 * phải giữ chúng đồng bộ bằng trigger hoặc cron, và chúng sẽ lệch. Repo này đã
 * bác đúng khuôn ấy bốn lần trước khi tới đây.
 *
 * ⚠ ĐẾM DISTINCT USER, không đếm số dòng. Hợp đồng viết rõ `attemptCount` là
 * "số người ĐÃ THỬ", nên một người nộp mười lần vẫn là một người. Một
 * `count(*)` ở đây sẽ làm `acceptanceRate` tụt xuống theo số lần thử lại — tức
 * là con số càng sai đi đúng ở những bài khó, chỗ nó đáng tin nhất.
 *
 * `::int` vì `count()` trả `bigint` và driver `postgres` đưa `int8` về JS dưới
 * dạng CHUỖI — không cast thì `acceptanceRate` là một phép chia trên hai chuỗi.
 */
export async function problemStats(db: DbOrTx, problemCode: string): Promise<ProblemStats> {
  const rows = await db
    .select({
      attemptCount: sql<number>`(count(distinct ${problemSubmissions.userId}))::int`,
      solverCount: sql<number>`(count(distinct ${problemSubmissions.userId}) filter (where ${problemSubmissions.solved}))::int`,
    })
    .from(problemSubmissions)
    .where(eq(problemSubmissions.problemCode, problemCode));

  const row = rows[0];
  // Một phép gộp không `GROUP BY` luôn trả đúng một dòng, kể cả khi không có dữ
  // liệu — nhưng `noUncheckedIndexedAccess` không biết điều đó, và một `!` ở đây
  // sẽ là chỗ duy nhất trong file nói dối trình biên dịch.
  return toProblemStats(row?.attemptCount ?? 0, row?.solverCount ?? 0);
}

/**
 * Quan hệ của một người với một bài.
 *
 * `bool_or` chứ không phải "dòng gần nhất": hợp đồng nói `solverCount` đếm người
 * đã giải được ÍT NHẤT MỘT LẦN, nên một lượt nộp trượt sau một lượt nộp đạt
 * không xoá đi việc họ đã giải được.
 */
export async function viewerStatusFor(
  db: DbOrTx,
  problemCode: string,
  userId: string,
): Promise<ProblemViewerStatus> {
  const rows = await db
    .select({ solved: sql<boolean | null>`bool_or(${problemSubmissions.solved})` })
    .from(problemSubmissions)
    .where(
      and(
        eq(problemSubmissions.problemCode, problemCode),
        eq(problemSubmissions.userId, userId),
      ),
    );
  // `bool_or` trên tập rỗng trả `NULL`, và `toViewerStatus` đọc `null` là
  // `untouched` — cùng quy ước với `LEFT JOIN` không khớp ở `list.ts`, nên hai
  // đường đọc khác nhau vẫn cho cùng một câu trả lời.
  return toViewerStatus(rows[0]?.solved ?? null);
}
