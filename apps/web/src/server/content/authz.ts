import { TRPCError } from '@trpc/server';
import type { ContentState, ContentVisibility } from '@devops-platform/shared-types/authoring';
import type { AuthedUser } from '../trpc/init';

/**
 * Ai đang hỏi → tầm nhìn nội dung (P9 9.C task 9).
 *
 * Luật 9 nói điều kiện "chỉ trả bài `published`" phải nằm TRONG NGUỒN chứ không
 * rải ra router. Hàm này là chỗ duy nhất dịch `AuthedUser` thành
 * `ContentVisibility`; nguồn (`dbContentSource`) nhận giá trị đó và tự dịch
 * tiếp thành tập state. Không procedure nào tự viết `where(state = …)`.
 *
 * ⚠ `null` (chưa đăng nhập) và `role: 'user'` cho ra CÙNG một tầm nhìn, và đó
 * là chủ ý: một người học đã đăng nhập không được thấy nhiều nội dung hơn một
 * người chưa — quyền đọc bài là chuyện của route, không phải của nguồn.
 */
export function visibilityFor(user: AuthedUser | null): ContentVisibility {
  if (user === null) {
    return { kind: 'published-only' };
  }
  switch (user.role) {
    case 'admin':
      return { kind: 'admin' };
    case 'author':
      return { kind: 'author', authorId: user.id };
    case 'user':
      return { kind: 'published-only' };
  }
}

/**
 * Chủ sở hữu bài — cổng THỨ HAI, chạy trên mọi procedure động tới một bài cụ thể.
 *
 * `authorProcedure` chỉ trả lời "người này có được soạn bài nói chung không".
 * Hàm này trả lời "bài NÀY có phải của họ không". Thiếu nó thì mọi `author`
 * sửa được bài của mọi `author` khác — đúng lỗ IDOR mà phase-9 xếp
 * **score 20**, cao nhất bảng rủi ro, vì đây là API GHI.
 *
 * `admin` bỏ qua (task 2: "admin sửa mọi bài"). Không có nấc nào giữa: `author`
 * KHÔNG sửa được bài người khác, kể cả bài đã archive.
 *
 * ⛔ Chú ý hình dạng lời gọi: `ownerId` phải là giá trị ĐỌC TỪ DB, không phải
 * một field trong `input`. Truyền `input.authorId` vào đây là tự kiểm tra một
 * con số do kẻ tấn công cung cấp so với chính nó.
 */
export function assertContentOwner(user: AuthedUser, ownerId: string): void {
  if (user.role === 'admin') {
    return;
  }
  if (user.id !== ownerId) {
    // NOT_FOUND, không FORBIDDEN: FORBIDDEN xác nhận rằng bài đó TỒN TẠI, và
    // một tác giả dò id bài của người khác không cần biết điều đó. Cùng lý do
    // route asset không phân biệt ENOENT với EACCES.
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
  }
}

/**
 * Route asset (`/api/scenarios/[id]/assets/[...path]`, nhánh nguồn DB) có được
 * phát byte của asset này cho người đang xem không.
 *
 * ⛔ Đây là lớp DEFENSE-IN-DEPTH, thêm 2026-09-18. Trước đó nhánh nguồn DB chỉ
 * gác ĐĂNG NHẬP: bất kỳ ai đã đăng nhập, biết `(contentId, storageKey)`, đều
 * tải được asset của một bài NHÁP/ARCHIVE — đi vòng qua tầng visibility của
 * tRPC (`visibilityFor` + nguồn DB) vốn chỉ trả bài `published` cho người học.
 * `storageKey` là 128-bit server-sinh nên khó đoán trong thực tế, nhưng "khó
 * đoán" không phải "được phép": một key rò ra (log, header `Referer`, ảnh chụp
 * bản xem trước chia sẻ) là đủ để asset của bản nháp rò theo. Cổng này khép
 * đúng bất đối xứng đó.
 *
 * Luật: asset của bài `published` phát cho mọi người đã đăng nhập (đối xứng với
 * "người học thấy bài published"); mọi state khác (`draft`/`publishing`/
 * `archived`) chỉ CHỦ hoặc ADMIN. Đọc `state` + `authorId` TỪ DB (join trong
 * `readContentAsset`), không từ input — cùng kỷ luật `assertContentOwner`.
 *
 * Hàm THUẦN + `viewer.isAdmin` (không phải `AuthedUser`) vì route đọc session
 * thô của Better Auth: `role` là chuỗi tự do, nên "admin?" fail-closed ở
 * `=== 'admin'` tại call-site, và ở đây chỉ còn một boolean đã quyết.
 */
export function mayServeContentAsset(
  item: { readonly state: ContentState; readonly authorId: string },
  viewer: { readonly id: string; readonly isAdmin: boolean },
): boolean {
  if (item.state === 'published') {
    return true;
  }
  if (viewer.isAdmin) {
    return true;
  }
  return viewer.id === item.authorId;
}
