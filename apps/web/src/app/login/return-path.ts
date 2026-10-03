/**
 * Đích quay về sau khi đăng nhập: HÀM THUẦN, có test (`return-path.test.ts`).
 *
 * `/login?next=<đường>` (hoặc `?callbackURL=`, tên Better Auth dùng) cho người
 * dùng quay lại đúng trang vừa bị chặn. Giá trị đó do URL mang tới, tức ai cũng
 * gõ được, nên nó là một lỗ chuyển hướng mở (open redirect) nếu nhận bừa:
 * `/login?next=//evil.com` gửi người vừa nhập mật khẩu sang một trang giả.
 *
 * Luật: chỉ nhận một đường TƯƠNG ĐỐI cùng origin. Giải mã ĐÚNG MỘT lần rồi mới
 * xét, vì `%2F%2F` sau khi giải mã chính là `//`. Sau đó phân tích bằng `URL`
 * trên một origin cố định và xét lại kết quả: `/.//evil.com` qua được mọi phép
 * so tiền tố nhưng `URL` chuẩn hoá nó thành đường `//evil.com`, đúng hình dạng
 * của một URL không giao thức.
 *
 * Bốn màn xác thực và `/api/*` bị loại: quay về `/login` sau khi đăng nhập là
 * một vòng lặp, quay về một endpoint là in JSON ra màn hình.
 */

/** Đích mặc định khi không có đường quay về hợp lệ. */
export const SIGNED_IN_HOME = '/me';

const BLOCKED_PREFIXES: readonly string[] = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/api',
];

/** Origin giả, chỉ để `URL` phân tích một đường tương đối. Không bao giờ ra ngoài hàm này. */
const PARSE_ORIGIN = 'http://return-path.invalid';

/* Ký tự điều khiển C0 và DEL: trình duyệt bỏ chúng đi khi phân tích URL, nên
   `/\t/evil.com` đọc thành `//evil.com` ở phía trình duyệt. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isBlocked(pathname: string): boolean {
  return BLOCKED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Đường quay về an toàn, hoặc `null` khi giá trị không đạt. `null` nghĩa là nơi
 * gọi dùng `SIGNED_IN_HOME`; hàm không tự trả mặc định để test thấy được ca từ chối.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // `%` lẻ, chuỗi mã hoá hỏng: không đoán ý người gửi.
    return null;
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//')) {
    return null;
  }
  if (decoded.includes('\\') || CONTROL_CHARS.test(decoded)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(decoded, PARSE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PARSE_ORIGIN || url.pathname.startsWith('//') || isBlocked(url.pathname)) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/** Đọc `next` trước, rồi `callbackURL`; cùng một luật cho cả hai. */
export function returnPathFrom(params: {
  readonly next?: string | readonly string[] | undefined;
  readonly callbackURL?: string | readonly string[] | undefined;
}): string | null {
  for (const value of [params.next, params.callbackURL]) {
    // Tham số lặp (`?next=a&next=b`) là mơ hồ, nên từ chối thay vì chọn một.
    if (typeof value === 'string') {
      const safe = safeReturnPath(value);
      if (safe !== null) {
        return safe;
      }
    }
  }
  return null;
}

/** Thêm `?next=` vào một liên kết giữa các màn xác thực, để đích quay về không rơi mất. */
export function withReturnPath(href: string, returnTo: string | null): string {
  return returnTo === null ? href : `${href}?next=${encodeURIComponent(returnTo)}`;
}
