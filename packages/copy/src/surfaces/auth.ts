import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `auth.`: bốn màn xác thực (`/login`, `/register`, `/forgot-password`,
 * `/reset-password`) cộng thư đặt lại mật khẩu.
 *
 * Bản dựng lại PTIT (2026-10-03): màn chia đôi, bên trái là poster đỏ nói nền
 * tảng làm gì, bên phải là form trên nền giấy. Giọng văn theo design-brief §8:
 * câu ngắn, nói việc cụ thể, nút là động từ.
 *
 * ## Mọi lỗi là `ErrorEntry`, và KHÔNG có lỗi nào từ Better Auth đi thẳng ra
 *
 * Message của thư viện là chuỗi tiếng Anh (`Invalid email or password`), nằm
 * ngoài bản đồ này. Nó đi vào `console.error` cho người vận hành, còn người dùng
 * luôn đọc một mục dưới đây.
 *
 * ## Mã đặt lại mật khẩu KHÔNG bao giờ nằm trên URL
 *
 * Luật 8 (`security/rule-08-no-token-in-url.test.ts`) cấm mọi mã đi qua query
 * string, và thư chỉ gửi đường trần `/reset-password` cộng mã trong thân thư.
 * Vì vậy không có khoá nào cho ca "liên kết thiếu mã": người dùng luôn dán mã.
 */
export const auth = {
  // ── Poster bên trái, dùng chung cho bốn màn ─────────────────────────────
  //
  // Người tới `/login` từ một liên kết được gửi thường không đi qua trang chủ,
  // nên đây là chỗ duy nhất họ đọc được nền tảng này làm gì.
  'auth.frame.headline': 'Học DevOps trên máy thật.',
  'auth.frame.body':
    'Mỗi bài mở một sandbox riêng có terminal. Bạn gõ lệnh, máy chấm từng nhiệm vụ ngay khi chạy xong. Không cần cài gì lên máy mình.',

  // ── Trường nhập ─────────────────────────────────────────────────────────
  'auth.field.name': 'Tên hiển thị',
  'auth.field.name-hint': 'Tên này hiện trên bảng xếp hạng nếu bạn cho phép. Đổi lại được trong Cài đặt.',
  'auth.field.email': 'Email',
  'auth.field.email-placeholder': 'ban@vidu.com',
  'auth.field.password': 'Mật khẩu',
  'auth.field.password-hint': 'Ít nhất 8 ký tự.',
  'auth.field.new-password': 'Mật khẩu mới',
  'auth.field.confirm-password': 'Nhập lại mật khẩu mới',

  // ── Phần dùng chung của form ────────────────────────────────────────────
  'auth.form.divider': 'hoặc',

  // ── Nhà cung cấp ngoài: "Tiếp tục" đúng cho cả đăng nhập lẫn tạo tài khoản ─
  'auth.oauth.google': 'Tiếp tục với Google',
  'auth.oauth.microsoft': 'Tiếp tục với Microsoft',

  // ── /login ──────────────────────────────────────────────────────────────
  'auth.login.meta-title': 'Đăng nhập',
  'auth.login.title': 'Đăng nhập',
  'auth.login.description': 'Dùng email và mật khẩu, hoặc tài khoản Google, Microsoft.',
  'auth.login.returning': 'Đăng nhập xong, bạn quay lại đúng trang vừa mở.',
  'auth.login.submit': 'Đăng nhập',
  'auth.login.forgot': 'Quên mật khẩu?',
  'auth.login.no-account': 'Chưa có tài khoản?',
  'auth.login.to-register': 'Tạo tài khoản',

  // ── /register ───────────────────────────────────────────────────────────
  'auth.register.meta-title': 'Tạo tài khoản',
  'auth.register.title': 'Tạo tài khoản',
  'auth.register.description': 'Cần một email và một mật khẩu. Bài đầu tiên mở được ngay sau đó.',
  'auth.register.submit': 'Tạo tài khoản',
  'auth.register.has-account': 'Đã có tài khoản?',
  'auth.register.to-login': 'Đăng nhập',

  // ── /forgot-password ────────────────────────────────────────────────────
  'auth.forgot.meta-title': 'Quên mật khẩu',
  'auth.forgot.title': 'Quên mật khẩu',
  'auth.forgot.description': 'Nhập email của tài khoản. Hệ thống gửi vào hộp thư đó một mã để đặt mật khẩu mới.',
  'auth.forgot.submit': 'Gửi mã đặt lại mật khẩu',
  'auth.forgot.pending': 'Đang gửi yêu cầu…',
  'auth.forgot.success-title': 'Đã nhận yêu cầu',
  'auth.forgot.success-body': (p: { email: string }) =>
    `Nếu ${p.email} có tài khoản, thư chứa mã sẽ tới trong vài phút. Xem cả mục thư rác. Mã dùng được trong 15 phút.`,
  'auth.forgot.next': 'Nhập mã đặt lại mật khẩu',
  'auth.forgot.back': 'Quay lại đăng nhập',

  // ── /reset-password ─────────────────────────────────────────────────────
  'auth.reset.meta-title': 'Đặt lại mật khẩu',
  'auth.reset.title': 'Đặt lại mật khẩu',
  'auth.reset.description': 'Dán mã trong thư rồi chọn mật khẩu mới.',
  'auth.reset.code': 'Mã đặt lại mật khẩu',
  'auth.reset.code-hint': 'Sao chép mã trong thư rồi dán vào đây. Khoảng trắng thừa được bỏ đi.',
  'auth.reset.submit': 'Đặt mật khẩu mới',
  'auth.reset.pending': 'Đang đổi mật khẩu…',
  'auth.reset.success-title': 'Đã đổi mật khẩu',
  'auth.reset.success-body': 'Các phiên đăng nhập cũ đã bị đăng xuất. Đăng nhập lại bằng mật khẩu mới.',
  'auth.reset.to-login': 'Đăng nhập bằng mật khẩu mới',
  'auth.reset.no-code': 'Chưa có mã, hoặc mã đã hết hạn?',
  'auth.reset.request-code': 'Gửi mã mới',
  'auth.reset.back': 'Quay lại đăng nhập',

  // ── Thư đặt lại mật khẩu (server/auth/password-reset-mail.ts) ───────────
  //
  // ⚠ `e2e/password-reset.spec.ts` đọc mã bằng `/Mã đặt lại mật khẩu:\s*(\S+)/`.
  // Đổi nhãn đứng trước mã trong thân thư là phải sửa luôn regex đó.
  'auth.mail.reset-subject': 'Mã đặt lại mật khẩu DevOps PTIT',
  'auth.mail.reset-body': (p: { code: string; url: string }) =>
    `Bạn vừa yêu cầu đặt lại mật khẩu DevOps PTIT.\n\nMã đặt lại mật khẩu: ${p.code}\n\nMở trang này và nhập mã cùng mật khẩu mới:\n${p.url}\n\nMã có hiệu lực trong 15 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, bỏ qua thư này.`,

  // ── Lỗi ─────────────────────────────────────────────────────────────────
  //
  // Mỗi mục khác nhau ở chỗ NGƯỜI DÙNG LÀM GÌ TIẾP: sai thông tin thì gõ lại,
  // email trùng thì đi đăng nhập, bấm quá nhiều thì đợi, mạng chết thì chưa biết
  // gì hết và không được bấm lại một cách mù.
  'auth.error.sign-in': {
    what: 'Không đăng nhập được với email và mật khẩu này.',
    next: 'Kiểm tra lại từng ô rồi thử lần nữa. Quên mật khẩu thì dùng liên kết bên dưới.',
  } satisfies ErrorEntry,
  'auth.error.sign-up': {
    what: 'Chưa tạo được tài khoản.',
    next: 'Nếu email này đã có tài khoản, đăng nhập thay vì tạo mới. Nếu chưa, kiểm tra lại email và mật khẩu.',
  } satisfies ErrorEntry,
  /*
    Better Auth chặn đăng nhập ở 3 lượt mỗi phút theo IP (đo 2026-09-07, xem
    `e2e/flows/flow-kit.ts`). Đọc 429 thành "sai mật khẩu" là đẩy người dùng đi
    gõ lại đúng thứ đang đúng, và mỗi lần gõ lại lại kéo dài lệnh chặn.
  */
  'auth.error.rate-limit': {
    what: 'Bạn vừa thử quá nhiều lần trong thời gian ngắn.',
    next: 'Đợi khoảng một phút rồi thử lại.',
  } satisfies ErrorEntry,
  'auth.error.reset-request': {
    what: 'Chưa gửi được yêu cầu đặt lại mật khẩu.',
    next: 'Đường gửi thư đang trục trặc. Thử lại sau ít phút, vẫn lỗi thì báo quản trị viên lớp.',
  } satisfies ErrorEntry,
  'auth.error.reset-invalid': {
    what: 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
    next: 'Gửi yêu cầu mới để nhận mã khác, rồi dán mã trong thư mới nhất.',
  } satisfies ErrorEntry,
  'auth.error.password-mismatch': {
    what: 'Hai ô mật khẩu chưa khớp nhau.',
    next: 'Gõ lại ô thứ hai cho giống ô trên.',
  } satisfies ErrorEntry,
  'auth.error.network': {
    what: 'Không gọi được máy chủ, nên chưa rõ yêu cầu vừa rồi đã tới chưa.',
    next: 'Kiểm tra kết nối mạng rồi bấm lại một lần. Bấm liên tục là gửi thêm yêu cầu.',
  } satisfies ErrorEntry,
} as const satisfies Surface<'auth'>;

/**
 * Không có nhóm ba nào trong surface này, và bảng rỗng là câu trả lời đúng.
 *
 * Vế thứ hai của T3 bắt một miễn trừ không còn khớp gì, nên thêm một dòng phòng
 * xa ở đây là tự tạo ra một ô đỏ.
 */
export const authIntentionalThree = {} as const satisfies IntentionalThree;
