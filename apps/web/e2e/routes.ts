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
  /**
   * `:<tên>` = đoạn động, thay bằng giá trị THẬT lúc chạy (xem `idFrom`).
   *
   * Tên đoạn là tự do (`:id`, `:code`) và `resolvePath` thay đoạn đầu tiên bất
   * kể tên. Đặt tên khớp thư mục Next (`[id]` / `[code]`) để nhãn test đọc ra
   * đúng thứ URL thật mang, chứ không phải một `:id` đồng phục che mất việc
   * `problems` khoá theo `code`.
   */
  path: string;
  auth: AuthLevel;
  /** Procedure tRPC cấp một giá trị thật cho đoạn động. Bắt buộc khi path có `:`. */
  idFrom?: string;
};

/**
 * 32 màn hình — 22 của D12 cộng 10 của P16 (`phase-16.md` §16.I mục 1).
 *
 * `/dashboard` và `/session` KHÔNG có ở đây: D12 gộp chúng vào `/me` bằng
 * redirect 308, nên chúng không phải màn hình để audit. Cổng cho hai đường đó
 * là chuyện của lane B.
 *
 * ── Mười màn P16, và vì sao đúng mười ───────────────────────────────────────
 *
 * Ba màn XÁC THỰC (`/register`, `/forgot-password`, `/reset-password`) do 16.B
 * dựng, và cả ba là `anon` — chúng phải mở được KHI CHƯA đăng nhập, nếu không
 * thì không ai tới được chúng.
 *
 * ⛔ `/reset-password` ở đây là đường TRẦN, không mang query. Bàn giao 16.B nói
 * rõ vì sao: `src/security/rule-08-no-token-in-url.test.ts` grep văn bản THÔ
 * trên cây mã, kể cả chú thích, nên chỉ cần viết một URL dạng
 * `/reset-password?token=…` vào file này là cổng đó đỏ — trong khi bản thân sản
 * phẩm không sai gì. Trạng thái "chưa bật" của trang là thứ ta audit, và nó
 * render ở đường trần.
 *
 * Bảy màn GAMES/PROBLEMS: hai của `/games` (16.E/16.C) và năm của `problems`
 * (16.C + 16.G2). `/problems/:code` và `/author/problems/:code` dùng đoạn động
 * tên `:code` chứ không `:id` — `resolvePath` thay đoạn `:<tên>` ĐẦU TIÊN bất
 * kể tên, nên nhãn test đọc đúng thứ URL thật mang.
 *
 * `/author/problems/:code` lấy id từ `problems.mine`, KHÔNG phải `problems.list`:
 * `list` trả mọi bài NHÌN THẤY ĐƯỢC (kể cả của tác giả khác) còn trang sửa chỉ
 * mở được bài CỦA MÌNH. Lấy nhầm nguồn thì ô đỏ với 403/404 và người đọc sẽ
 * truy sang authz của sản phẩm thay vì sang một dòng cấu hình harness.
 */
export const SCREENS: Screen[] = [
  { path: '/', auth: 'anon' },
  { path: '/login', auth: 'anon' },
  { path: '/register', auth: 'anon' },
  { path: '/forgot-password', auth: 'anon' },
  { path: '/reset-password', auth: 'anon' },

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

  { path: '/games', auth: 'user' },
  { path: '/games/k8s', auth: 'user' },
  { path: '/problems', auth: 'user' },
  { path: '/problems/:code', auth: 'user', idFrom: 'problems.list' },

  { path: '/author', auth: 'author' },
  { path: '/author/new', auth: 'author' },
  { path: '/author/:id', auth: 'author', idFrom: 'authoring.list' },
  { path: '/author/problems', auth: 'author' },
  { path: '/author/problems/new', auth: 'author' },
  { path: '/author/problems/:code', auth: 'author', idFrom: 'problems.mine' },

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
export const MIN_SCREENS = 32;

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
