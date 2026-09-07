/**
 * Quyết định của khối "Tài khoản" trên `/settings` — HÀM THUẦN.
 *
 * `apps/web` chạy vitest ở `environment: 'node'` theo MẶC ĐỊNH, nên mọi quyết
 * định đáng gác phải nằm ngoài JSX để test bám vào được — cùng khuôn
 * `summarizeProgress` (P2) và `components/admin/session-row.ts`.
 *
 * ⚠ Từ `727af45`, jsdom + RTL bật được theo TỪNG FILE bằng docblock
 * `// @vitest-environment jsdom`. Khuôn hàm-thuần vẫn là mặc định nên dùng, chỉ
 * là nó không còn bắt buộc.
 */

/** Khớp `minLength={8}` của form đăng ký và mặc định của Better Auth (không có override trong `auth/config.ts`). */
export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordSectionView {
  /** `false` ⇒ KHÔNG render form đổi mật khẩu. */
  readonly visible: boolean;
  /** Câu giải thích khi ẩn; `null` khi form hiện. */
  readonly reason: string | null;
}

/**
 * ## Vì sao "ẩn form" phải là một quyết định có tên, không phải một `&&` trong JSX
 *
 * `me.get` trả `hasPassword` bằng cách hỏi bảng `accounts` xem có dòng
 * `providerId = 'credential'` không (`hasCredentialAccount`). `false` nghĩa là
 * tài khoản này **chưa bao giờ có mật khẩu** — nó đăng nhập bằng Google hoặc
 * Microsoft (hai social provider duy nhất trong `auth/config.ts`).
 *
 * Hiện form cho họ là một cái bẫy hoàn chỉnh: người dùng gõ "mật khẩu hiện tại"
 * mà họ không có, `/api/auth/change-password` trả lỗi, và câu lỗi đó nói về mật
 * khẩu sai — dẫn thẳng tới kết luận "tôi quên mật khẩu" cho một tài khoản
 * không có mật khẩu nào để quên.
 *
 * Ẩn nó mà không nói gì cũng chưa đủ: người dùng đi tìm chỗ đổi mật khẩu và
 * thấy trang trống. Nên `reason` là phần bắt buộc của quyết định này, không
 * phải phần trang trí — và đó là lý do hàm trả một object thay vì một boolean.
 */
export function describePasswordSection(hasPassword: boolean): PasswordSectionView {
  if (hasPassword) {
    return { visible: true, reason: null };
  }
  return {
    visible: false,
    reason:
      'Tài khoản này đăng nhập bằng Google hoặc Microsoft nên không có mật khẩu ở đây để đổi. ' +
      'Đổi mật khẩu tại chính nhà cung cấp đó.',
  };
}

export interface PasswordChangeInput {
  readonly current: string;
  readonly next: string;
  readonly confirm: string;
}

/**
 * Kiểm phía client TRƯỚC khi gọi `/api/auth/change-password`.
 *
 * Không thay cho kiểm phía server (Better Auth vẫn tự kiểm) — nó chỉ tránh một
 * vòng mạng cho ba lỗi mà client tự thấy được, và cho câu lỗi tiếng Việt nói rõ
 * làm gì tiếp thay vì câu tiếng Anh của thư viện.
 *
 * ⚠ KHÔNG kiểm "mật khẩu mới phải khác mật khẩu cũ" ở đây: đó là chuyện server
 * biết chắc còn client chỉ so hai chuỗi người dùng vừa gõ — và nếu họ gõ sai
 * mật khẩu hiện tại thì phép so đó chặn nhầm một lượt đổi hợp lệ.
 */
export function validatePasswordChange(input: PasswordChangeInput): string | null {
  if (input.current === '') {
    return 'Nhập mật khẩu hiện tại để xác nhận đây là bạn.';
  }
  if (input.next.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu mới cần ít nhất ${String(MIN_PASSWORD_LENGTH)} ký tự. Thêm ký tự rồi lưu lại.`;
  }
  if (input.next !== input.confirm) {
    return 'Hai ô mật khẩu mới chưa khớp. Gõ lại ô xác nhận cho giống ô trên.';
  }
  return null;
}

/**
 * Câu lỗi cho một lượt đổi mật khẩu hỏng.
 *
 * Better Auth trả `INVALID_PASSWORD` khi mật khẩu hiện tại sai — câu chữ phải
 * chỉ đúng vào ô đó, vì nếu không thì người dùng sẽ đi sửa ô mật khẩu MỚI.
 */
export function describePasswordChangeError(code: string | null, message: string | null): string {
  if (code === 'INVALID_PASSWORD') {
    return 'Mật khẩu hiện tại không đúng. Kiểm tra lại ô đầu tiên rồi lưu lại.';
  }
  if (message !== null && message !== '') {
    return `${message} Thử lại sau ít phút; nếu vẫn hỏng thì đăng xuất rồi đăng nhập lại.`;
  }
  return 'Không đổi được mật khẩu. Kiểm tra kết nối rồi thử lại.';
}
