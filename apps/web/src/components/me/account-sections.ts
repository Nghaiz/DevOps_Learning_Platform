import { err, t } from '@devops-platform/copy';

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
  return { visible: false, reason: t('me.password.hidden-reason') };
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
    return joinError(err('me.error.password-current-empty'));
  }
  if (input.next.length < MIN_PASSWORD_LENGTH) {
    return joinError(err('me.error.password-too-short', { min: MIN_PASSWORD_LENGTH }));
  }
  if (input.next !== input.confirm) {
    return joinError(err('me.error.password-mismatch'));
  }
  return null;
}

/**
 * Ghép hai nửa của `ErrorEntry` thành một chuỗi, và đây là chỗ ghép DUY NHẤT
 * của form mật khẩu.
 *
 * Nơi gọi cất câu lỗi vào một `useState<string | null>` dùng chung cho cả lỗi
 * kiểm phía client lẫn lỗi Better Auth trả về, nên hai nửa phải hợp lại đúng
 * một lần ở tầng này. Hai nửa VẪN tách rời ở tầng kiểu (bản đồ), thứ mà luật
 * số 4 của design §5 ép ra; cái mất ở đây chỉ là hai khe hiển thị riêng.
 */
function joinError(entry: { readonly what: string; readonly next: string }): string {
  return `${entry.what} ${entry.next}`;
}

/**
 * Câu lỗi cho một lượt đổi mật khẩu hỏng.
 *
 * Better Auth trả `INVALID_PASSWORD` khi mật khẩu hiện tại sai — câu chữ phải
 * chỉ đúng vào ô đó, vì nếu không thì người dùng sẽ đi sửa ô mật khẩu MỚI.
 */
export function describePasswordChangeError(code: string | null, message: string | null): string {
  if (code === 'INVALID_PASSWORD') {
    return joinError(err('me.error.password-invalid'));
  }
  if (message !== null && message !== '') {
    return joinError(err('me.error.password-other', { message }));
  }
  return joinError(err('me.error.password-unknown'));
}
