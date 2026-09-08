import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { problems } from '../db/schema';
import type { AuthedUser } from '../trpc/init';

/**
 * Chủ sở hữu bài — cổng THỨ HAI, chạy trên mọi thao tác động tới một bài cụ thể.
 *
 * `authorProcedure` chỉ trả lời "người này có được soạn bài nói chung không".
 * Hàm này trả lời "bài NÀY có phải của họ không". Thiếu nó thì mọi `author` sửa
 * được bài của mọi `author` khác — đúng lỗ IDOR mà `authoring.ts` xếp cao nhất
 * bảng rủi ro, vì đây là API GHI.
 *
 * `NOT_FOUND`, không `FORBIDDEN`: `FORBIDDEN` xác nhận rằng bài đó TỒN TẠI, và
 * một tác giả dò mã bài của người khác không cần biết điều đó.
 *
 * ⛔ `ownerId` phải là giá trị ĐỌC TỪ DB, không phải một field trong `input`.
 */
export function assertProblemOwner(user: AuthedUser, ownerId: string | null): void {
  if (user.role === 'admin') {
    return;
  }
  if (ownerId === null || user.id !== ownerId) {
    // `ownerId === null` là bài seed trong repo: không tác giả nào sở hữu nó,
    // nên chỉ admin sửa được. Một `author` sửa được bài seed nghĩa là mọi
    // `author` sửa được nội dung gốc của hệ thống.
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
  }
}

/** Đọc bài để GHI, kèm cổng chủ sở hữu. Trả về dòng thô vì chỗ gọi cần `authorId`. */
export async function findProblemForWrite(db: Database, user: AuthedUser, code: string) {
  const rows = await db.select().from(problems).where(eq(problems.code, code)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
  }
  assertProblemOwner(user, row.authorId);
  return row;
}
