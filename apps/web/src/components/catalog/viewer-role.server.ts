import { readRequestSession } from '../../server/auth/config';

/**
 * ⛔ MODULE PHÍA MÁY CHỦ. Chỉ `page.tsx`/`layout.tsx` (Server Component) được
 * import; kéo nó vào một file `'use client'` sẽ lôi `next/headers` + Better
 * Auth + driver Postgres vào bundle trình duyệt. Hậu tố `.server.ts` là để lỗi
 * đó nhìn thấy được ở chỗ import, không phải lúc `next build` đổ.
 *
 * Thư mục này CỐ Ý không có `index.ts` barrel — một barrel gom cả file client
 * lẫn file này lại là đúng cách để `node:fs` lọt vào một client component,
 * hạng lỗi đã làm đổ build một lần ở chặng trước.
 */

/**
 * Phiên đăng nhập của lượt render hiện tại, **dedupe trong một request**.
 *
 * Đây là BÍ DANH của `readRequestSession`, không phải một bản bọc thứ hai.
 * `cache()` memo hoá theo THAM CHIẾU HÀM: bọc `getSession` hai lần là hai khoá
 * khác nhau, nên hai lượt DB vẫn xảy ra trong khi mọi kết quả đều đúng và
 * không có gì đỏ. Bản trước của file này đúng là một bọc thứ hai như vậy.
 *
 * ⚠ Lợi ích chỉ có khi MỌI phía đi qua cùng một hàm. Gọi thẳng
 * `getAuth().api.getSession(...)` ở bất kỳ đâu là quay lại nhiều lượt DB, âm
 * thầm. Và `cache()` chỉ memo hoá dưới điều kiện `react-server` (Server
 * Component); ở bản dựng client nó là hàm rỗng, nên đừng đo nó bằng vitest
 * thường rồi kết luận cache hỏng.
 */
export const readViewerSession = readRequestSession;

/**
 * Người đang xem có soạn được nội dung không — dùng để chọn câu chữ cho trạng
 * thái rỗng (13.C task 11), KHÔNG phải để gác quyền.
 *
 * Fail-closed: vai trò lạ hoặc chưa đăng nhập ⇒ `false` ⇒ người xem thấy gợi ý
 * của người học. Hiện nhầm link "Soạn bài" cho người không có quyền chỉ dẫn họ
 * tới một trang sẽ redirect họ ra; cổng thật nằm ở `authorProcedure` và ở
 * `layout.tsx` của `/author`, không ở đây.
 */
export async function readCanAuthor(): Promise<boolean> {
  const session = await readViewerSession();
  const role: unknown = session?.user.role;
  return role === 'author' || role === 'admin';
}
