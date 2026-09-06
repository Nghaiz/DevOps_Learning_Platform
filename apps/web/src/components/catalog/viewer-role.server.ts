import { cache } from 'react';
import { headers } from 'next/headers';
import { getAuth } from '../../server/auth/config';

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
 * `cache()` của React memo hoá theo lượt render phía server, nên `layout.tsx`
 * và `page.tsx` của cùng một route gọi hàm này hai lần vẫn chỉ đụng DB MỘT
 * lần. Đó là điều kiện để `/lessons` vừa gác auth ở layout (theo nhận xét sẵn
 * có: "lặp lại sẽ là hai lượt getSession") vừa đọc được vai trò ở page.
 *
 * ⚠ Lợi ích này chỉ có khi CẢ HAI phía đi qua đúng hàm này. Gọi thẳng
 * `getAuth().api.getSession(...)` ở một trong hai chỗ là quay lại hai lượt DB —
 * âm thầm, vì kết quả vẫn đúng.
 */
export const readViewerSession = cache(async () => getAuth().api.getSession({ headers: await headers() }));

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
