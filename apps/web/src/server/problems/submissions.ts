import { TRPCError } from '@trpc/server';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Database } from '../db/client';
import { problemSubmissions } from '../db/schema';
import { toSubmissionDTO, type ProblemSubmissionWithGrade } from './dto';

export interface SubmissionPage {
  readonly items: readonly ProblemSubmissionWithGrade[];
  readonly nextCursor: string | null;
}

/**
 * Lịch sử nộp bài CỦA CHÍNH NGƯỜI GỌI trên một bài, mới nhất trước.
 *
 * ⛔ Không có tham số `userId` trong hình dạng gọi từ router — nó tới từ
 * `ctx.user.id`. Một field `userId` trong input là một field kẻ tấn công điền
 * được, và lịch sử làm bài của người khác là dữ liệu riêng tư (nó nói họ trượt
 * mấy lần).
 *
 * Keyset trên `(submitted_at, id)` giảm dần, cùng khuôn `labs.listMyAttempts`.
 * Con trỏ là `id` của dòng cuối, và mốc thời gian được tra LẠI TỪ DB theo id đó
 * thay vì mã hoá vào chuỗi con trỏ: `id` là `uuid` nên nó tự chứng minh mình
 * thuộc về bảng này, và không có phép ép kiểu thời gian nào ở giữa để làm tròn
 * sai. Cột `submitted_at` khai `precision: 3` nên `Date` đọc ra khớp chính xác
 * giá trị đã lưu — xem chú thích ở `schema.ts`.
 */
export async function listMySubmissions(
  db: Database,
  userId: string,
  problemCode: string,
  limit: number,
  cursor: string | undefined,
): Promise<SubmissionPage> {
  const ownership = and(
    eq(problemSubmissions.userId, userId),
    eq(problemSubmissions.problemCode, problemCode),
  );

  let cursorRow: { submittedAt: Date; id: string } | undefined;
  if (cursor !== undefined) {
    const rows = await db
      .select({ submittedAt: problemSubmissions.submittedAt, id: problemSubmissions.id })
      .from(problemSubmissions)
      // Tra con trỏ TRONG phạm vi sở hữu: một `uuid` của người khác không được
      // dùng làm mốc, nếu không thì nó là một kênh dò ("id này có tồn tại không")
      // dù nội dung không rò ra.
      .where(and(eq(problemSubmissions.id, cursor), ownership))
      .limit(1);
    cursorRow = rows[0];
    if (cursorRow === undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
    }
  }

  const page = await db
    .select()
    .from(problemSubmissions)
    .where(
      cursorRow === undefined
        ? ownership
        : and(
            ownership,
            or(
              lt(problemSubmissions.submittedAt, cursorRow.submittedAt),
              // Vế tie-break: hai lượt nộp trong cùng một mili giây là chuyện có
              // thật khi người ta bấm nộp lại ngay. Thiếu vế này thì cả nhóm
              // trùng mốc bị nhảy qua — mất dòng, im lặng.
              and(
                eq(problemSubmissions.submittedAt, cursorRow.submittedAt),
                lt(problemSubmissions.id, cursorRow.id),
              ),
            ),
          ),
    )
    .orderBy(desc(problemSubmissions.submittedAt), desc(problemSubmissions.id))
    .limit(limit + 1);

  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;
  const last = items[items.length - 1];
  return {
    items: items.map(toSubmissionDTO),
    nextCursor: hasMore && last !== undefined ? last.id : null,
  };
}
