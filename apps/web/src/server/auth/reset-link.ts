/**
 * SSOT của đường đi mã đặt lại mật khẩu: hằng số vòng đời, hình dạng cookie, và
 * hình dạng liên kết trong thư. Ba nơi đọc file này (`auth/config.ts`,
 * `api/auth/reset-link/[token]`, `api/auth/reset-finish`) nên không nơi nào tự
 * dựng lại một trong ba thứ đó.
 *
 * ## ⛔ LUẬT 8 — mã KHÔNG đi qua query string, và đây là chỗ luật đó thành hình
 *
 * `src/security/rule-08-no-token-in-url.test.ts` grep toàn bộ `apps/web/src` tìm
 * ba hình dạng: đọc mã từ `searchParams`, đọc mã từ `req.query`, và dựng URL có
 * tham số truy vấn tên `token`. Cổng đó ĐÚNG, và nó va thẳng vào mặc định của
 * Better Auth.
 *
 * Better Auth tự dựng liên kết `{baseURL}/reset-password/{mã}` rồi cấp một
 * endpoint chuyển hướng đọc mã đó và đẩy tiếp sang `callbackURL` **kèm mã trong
 * query string** (`dist/api/routes/password.mjs`, hàm `requestPasswordResetCallback`).
 * Nên ta KHÔNG dùng `url` mà thư viện đưa cho `sendResetPassword`, và KHÔNG dùng
 * endpoint chuyển hướng của nó. Ta dựng liên kết của riêng mình.
 *
 * ## Đường đi thật, ba bước
 *
 * 1. Thư mang `{origin}/api/auth/reset-link/{mã}` — mã nằm trong PHÂN ĐOẠN
 *    ĐƯỜNG DẪN, không phải query string.
 * 2. Route handler ở đó đổi mã lấy một cookie `HttpOnly` rồi chuyển hướng 303
 *    sang `/reset-password` TRẦN (không tham số nào).
 * 3. Form gửi mật khẩu mới tới `/api/auth/reset-finish`; cookie đi kèm request
 *    đó, còn JavaScript của trang thì không bao giờ nhìn thấy mã.
 *
 * Cái mà bước 2 mua được, và vì sao nó không phải thủ tục hình thức: sau lượt
 * chuyển hướng, thanh địa chỉ của TRANG NHẬP MẬT KHẨU không chứa mã. Nên mã
 * không nằm trong lịch sử trình duyệt của trang đó, không đi kèm header
 * `Referer` của mọi tài nguyên bên thứ ba mà trang nạp, không lọt vào ảnh chụp
 * màn hình người dùng gửi cho trợ giúp, và không đọc được từ `document.cookie`.
 * Mã vẫn đi qua URL đúng MỘT lượt, ở bước 1, và lượt đó là điều không tránh
 * được với bất kỳ luồng "bấm vào liên kết trong thư" nào.
 *
 * ## `SameSite=Lax` chứ không `Strict`, và đây là một cái bẫy đã đọc kỹ
 *
 * Cookie phiên sandbox (`auth/sandbox-cookie.ts`) dùng `Strict` vì nó chỉ được
 * đặt và đọc trong cùng một phiên làm việc đã mở sẵn. Cookie này thì khác: nó
 * được đặt trong một lượt điều hướng ĐẾN TỪ MỘT SITE KHÁC (người dùng bấm liên
 * kết trong Gmail/Outlook). Với `Strict`, trình duyệt tính "site khởi xướng" cho
 * cả chuỗi chuyển hướng, nên cookie vừa đặt sẽ KHÔNG được gửi kèm lượt GET
 * `/reset-password` ngay sau đó, và trang sẽ nói "không có liên kết" đúng một
 * giây sau khi ta vừa đặt liên kết. Hỏng im lặng, chỉ ở trình duyệt thật, không
 * test đơn vị nào thấy.
 *
 * `Lax` gửi cookie cho điều hướng cấp cao nhất bằng GET, tức đúng bước 2, và
 * vẫn KHÔNG gửi cho một POST xuyên site — nên `/api/auth/reset-finish` không
 * mở ra một đường CSRF: một trang lạ POST sang đó sẽ không mang cookie nào.
 *
 * ## `Secure` không rẽ nhánh theo NODE_ENV
 *
 * Cùng lý lẽ đã ghi ở `sandbox-cookie.ts`: trình duyệt chấp nhận cookie `Secure`
 * trên HTTP khi host là `localhost` (secure context), nên dev cục bộ chạy bình
 * thường; một nhánh `NODE_ENV` ở đây sẽ tắt đúng lớp phòng thủ đó ở lần deploy
 * đầu tiên mà ai đó quên đặt biến.
 */

/**
 * Vòng đời của mã, tính bằng giây. MỘT hằng số, HAI người dùng: nó là
 * `resetPasswordTokenExpiresIn` của Better Auth (hạn của hàng trong bảng
 * `verifications`) VÀ là `Max-Age` của cookie mang mã đó.
 *
 * Hai con số riêng biệt sẽ đẻ ra một cửa sổ mà một trong hai còn sống: cookie
 * chết trước thì người dùng bấm "Đặt mật khẩu mới" và nhận "liên kết không còn
 * dùng được" trong khi mã vẫn hợp lệ; mã chết trước thì trang vẫn hiện form vì
 * cookie còn đó. Cả hai chế độ hỏng đều chỉ lộ ra ở tận trình duyệt, cách nguyên
 * nhân hai thành phần. Một hằng số thì không có cửa sổ nào.
 *
 * 30 phút: đủ cho một lượt gửi thư chậm cộng thời gian người dùng đọc và gõ,
 * ngắn hơn hẳn mặc định 1 giờ của thư viện.
 */
export const RESET_TOKEN_TTL_SECONDS = 30 * 60;

export const RESET_COOKIE_NAME = 'dlp_reset';

/**
 * HAI đường mang cookie này, và không đường nào thừa.
 *
 * `/reset-password` để trang server-render biết có liên kết đã đổi thành công
 * hay không, và nói ra điều đó TRƯỚC khi người dùng gõ mật khẩu mới, thay vì để
 * họ gõ xong rồi mới nhận lỗi. `/api/auth/reset-finish` là nơi mã thật sự được
 * dùng.
 *
 * ⛔ KHÔNG gộp thành một cookie `Path=/`: đó là cho mã đặt lại mật khẩu đi kèm
 * MỌI request tới mọi route của ứng dụng, mở rộng bề mặt rò header ra toàn bộ
 * trang. Cùng lý lẽ đã ghi ở `SANDBOX_COOKIE_PATHS`.
 */
export const RESET_COOKIE_PATHS = ['/reset-password', '/api/auth/reset-finish'] as const;

export function buildResetCookie(token: string, path: string): string {
  return [
    `${RESET_COOKIE_NAME}=${token}`,
    `Path=${path}`,
    `Max-Age=${String(RESET_TOKEN_TTL_SECONDS)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

/**
 * Xoá cookie. `Max-Age=0` VÀ giá trị rỗng: một số trình duyệt cũ bỏ qua
 * `Max-Age` âm, và cặp `(name, path)` phải khớp ĐÚNG cookie đã đặt thì lượt xoá
 * mới trúng.
 */
export function clearResetCookie(path: string): string {
  return [
    `${RESET_COOKIE_NAME}=`,
    `Path=${path}`,
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

/**
 * Liên kết đặt trong thư. `origin` là `BETTER_AUTH_URL` (origin công khai), cắt
 * dấu chéo cuối để không sinh ra đường dẫn hai chéo.
 */
export function buildResetLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/api/auth/reset-link/${encodeURIComponent(token)}`;
}
