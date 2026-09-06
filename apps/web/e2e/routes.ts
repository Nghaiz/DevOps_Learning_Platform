/**
 * Danh sách MÀN HÌNH CHỐT của P13 — chép từ D12 (`phase-13-exec.md` §1), là
 * SSOT cho a11y / CSP / keyboard.
 *
 * ⛔ Đây là một DANH SÁCH VIẾT TAY, cố ý. Cám dỗ hiển nhiên là quét
 * `apps/web/src/app/**\/page.tsx` lúc chạy và audit "mọi thứ tìm thấy". Đừng.
 * Một spec tự khám phá đối tượng của nó sẽ THÍCH NGHI với mọi cây mã: xoá nửa
 * số route đi thì nó vẫn xanh, chỉ là quét ít hơn — và không ai đọc được sự
 * khác biệt giữa "0 lỗi trên 22 màn" với "0 lỗi trên 3 màn". Cùng lớp lỗi với
 * `__EXPECT_WEBGL2__` của `packages/terminal/vitest.config.ts`: tiêm KỲ VỌNG
 * vào, đừng để cảnh tự khai báo chính nó.
 *
 * Hệ quả có chủ ý: một màn hình trong D12 mà chưa lane nào dựng sẽ làm spec ĐỎ
 * với "route chưa dựng". Đó là 13.H báo cáo hiện trạng, không phải harness
 * hỏng. Thêm màn hình mới ⇒ phải hỏi chủ dự án (D12) ⇒ phải sửa file này.
 */

export type AuthLevel = 'anon' | 'user' | 'author' | 'admin';

export type Screen = {
  /** `:id` = đoạn động, thay bằng id THẬT lúc chạy (xem `idFrom`). */
  path: string;
  auth: AuthLevel;
  /** Procedure tRPC cấp một id thật cho route `:id`. Bắt buộc khi path có `:id`. */
  idFrom?: string;
};

/**
 * 22 màn hình của D12.
 *
 * `/dashboard` và `/session` KHÔNG có ở đây: D12 gộp chúng vào `/me` bằng
 * redirect 308, nên chúng không phải màn hình để audit. Cổng cho hai đường đó
 * là chuyện của lane B.
 */
export const SCREENS: Screen[] = [
  { path: '/', auth: 'anon' },
  { path: '/login', auth: 'anon' },

  { path: '/lessons', auth: 'user' },
  { path: '/lessons/:id', auth: 'user', idFrom: 'lessons.list' },
  { path: '/labs', auth: 'user' },
  { path: '/labs/:id', auth: 'user', idFrom: 'labs.list' },
  { path: '/playgrounds', auth: 'user' },
  { path: '/playgrounds/:id', auth: 'user', idFrom: 'playgrounds.list' },
  { path: '/paths', auth: 'user' },
  { path: '/paths/:id', auth: 'user', idFrom: 'paths.list' },
  { path: '/quiz', auth: 'user' },
  { path: '/quiz/:id', auth: 'user', idFrom: 'quiz.list' },
  { path: '/me', auth: 'user' },
  { path: '/settings', auth: 'user' },

  { path: '/author', auth: 'author' },
  { path: '/author/new', auth: 'author' },
  { path: '/author/:id', auth: 'author', idFrom: 'authoring.list' },

  { path: '/admin', auth: 'admin' },
  { path: '/admin/users', auth: 'admin' },
  { path: '/admin/sessions', auth: 'admin' },
  { path: '/admin/content', auth: 'admin' },
  { path: '/admin/audit', auth: 'admin' },
];

/**
 * Sàn cứng cho `SCREENS.length`.
 *
 * Không phải trang trí: nếu ai đó rút danh sách xuống còn hai dòng để "cho
 * suite xanh nhanh", mọi test a11y vẫn PASS — chỉ là ít test hơn — và bảng
 * tổng kết vẫn ghi "0 lỗi serious/critical". Ô này biến việc rút ngắn thành
 * một lỗi ĐỎ, có tên.
 */
export const MIN_SCREENS = 22;

/** Vai trò `admin` bao hàm `author` (C6: /author cho author|admin). */
export function roleSatisfies(actual: string, required: AuthLevel): boolean {
  if (required === 'anon' || required === 'user') return true;
  if (required === 'author') return actual === 'author' || actual === 'admin';
  return actual === 'admin';
}

/** Nhãn ổn định cho tên test — `/lessons/:id` chứ không phải id thật đang đổi. */
export function screenLabel(screen: Screen): string {
  return `${screen.path} [${screen.auth}]`;
}
