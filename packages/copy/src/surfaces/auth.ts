import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `auth.`, sở hữu bởi lane 16.B (L1). Phủ bốn màn xác thực:
 * `/login`, `/register`, `/forgot-password`, `/reset-password`.
 *
 * Yêu cầu gửi mã chỉ xác nhận tiếp nhận, không xác nhận thư đã tới hộp thư.
 * Phản hồi không tiết lộ một địa chỉ có tài khoản hay chưa.
 *
 * ## Mọi lỗi là `ErrorEntry`, và KHÔNG có lỗi nào từ Better Auth đi thẳng ra
 *
 * Trước P16, `login-form.tsx` hiển thị `authError.message` của Better Auth khi
 * có, chỉ rơi về câu tiếng Việt khi message vắng mặt. Message đó là chuỗi tiếng
 * Anh do thư viện sinh (`Invalid email or password`), nằm ngoài bản đồ này, và
 * không cổng nào của P16 nhìn thấy nó. Lane 16.B chốt: message của thư viện đi
 * vào `console.error` cho người vận hành, còn người dùng luôn đọc `ErrorEntry`
 * dưới đây. Ghi vào report như một quyết định đáng tranh luận.
 */
export const auth = {
  // ── Khung chung của bốn màn ─────────────────────────────────────────────
  //
  // Cột trái của khung là chỗ DUY NHẤT trong bốn màn nói nền tảng này làm gì.
  // Người chưa đăng nhập tới `/login` từ một liên kết được gửi thường không đi
  // qua trang chủ, nên nếu ở đây không nói thì họ không đọc ở đâu cả.
  //
  // Cung ellipse của khung KHÔNG có khoá nào ở đây: nó là trang trí thuần,
  // nằm trong khối `aria-hidden`, và một nhãn gắn lên nó chỉ bắt trình đọc màn
  // hình đọc lại điều hai câu bên cạnh vừa nói. Cùng lý lẽ với `AdminSection`.
  'auth.frame.headline': 'Học DevOps bằng cách chạy thật',
  'auth.frame.body':
    'Mỗi bài mở một sandbox riêng, có terminal thật và nhiệm vụ chấm tự động. Không phải cài gì lên máy bạn.',

  // ── Trường nhập ─────────────────────────────────────────────────────────
  'auth.field.name': 'Tên hiển thị',
  'auth.field.email': 'Email',
  'auth.field.email-placeholder': 'ban@vidu.com',
  'auth.field.password': 'Mật khẩu',
  'auth.field.password-hint': 'Tối thiểu 8 ký tự.',
  'auth.field.new-password': 'Mật khẩu mới',
  'auth.field.confirm-password': 'Nhập lại mật khẩu mới',

  // ── Phần dùng chung của form ────────────────────────────────────────────
  'auth.form.divider': 'hoặc',

  // ── Nhà cung cấp ngoài ──────────────────────────────────────────────────
  'auth.oauth.google': 'Đăng nhập với Google',
  'auth.oauth.microsoft': 'Đăng nhập với Microsoft',

  // ── /login ──────────────────────────────────────────────────────────────
  'auth.login.meta-title': 'Đăng nhập · DevOps Learning Platform',
  'auth.login.title': 'Đăng nhập',
  'auth.login.description': 'Dùng email và mật khẩu, hoặc tài khoản tổ chức.',
  'auth.login.submit': 'Đăng nhập',
  'auth.login.forgot': 'Quên mật khẩu?',
  'auth.login.to-register': 'Chưa có tài khoản? Đăng ký',

  // ── /register ───────────────────────────────────────────────────────────
  //
  // Tách khỏi `/login` ở P16: trước đó một thẻ 218 dòng gánh cả hai chế độ qua
  // một `useState<'sign-in' | 'sign-up'>`, nên hai màn không có URL riêng và
  // không màn nào vào được cổng a11y của 16.I dưới tên của chính nó.
  'auth.register.meta-title': 'Đăng ký · DevOps Learning Platform',
  'auth.register.title': 'Tạo tài khoản',
  'auth.register.description': 'Một email và một mật khẩu là đủ để bắt đầu bài đầu tiên.',
  'auth.register.submit': 'Tạo tài khoản',
  'auth.register.to-login': 'Đã có tài khoản? Đăng nhập',

  // ── /forgot-password ────────────────────────────────────────────────────
  'auth.forgot.meta-title': 'Quên mật khẩu · DevOps Learning Platform',
  'auth.forgot.title': 'Quên mật khẩu',
  'auth.forgot.description': 'Nhập email của tài khoản để nhận mã đặt lại mật khẩu.',
  'auth.forgot.submit': 'Gửi mã đặt lại mật khẩu',
  'auth.forgot.pending': 'Đang gửi yêu cầu…',
  'auth.forgot.success-title': 'Yêu cầu đã được tiếp nhận',
  'auth.forgot.success-body': (p: { email: string }) =>
    `Nếu ${p.email} có tài khoản, hãy kiểm tra hộp thư và thư rác để lấy mã. Mã có hiệu lực trong 15 phút. Nếu chưa thấy thư, thử lại sau ít phút hoặc liên hệ quản trị viên lớp.`,
  'auth.forgot.next': 'Nhập mã đặt lại mật khẩu',
  'auth.forgot.back': 'Quay lại đăng nhập',

  // ── /reset-password ─────────────────────────────────────────────────────
  //
  // Màn này chỉ tới được từ một liên kết trong thư, mà thư thì chưa gửi được.
  //
  // ⛔ KHÔNG có khoá nào cho ca "liên kết thiếu mã". Hai khoá như vậy đã tồn
  // tại ở lượt đầu và bị xoá cùng nhánh đọc mã ra khỏi query string, thứ mà
  // `security/rule-08-no-token-in-url.test.ts` bắt được: luật 8 cấm mọi mã đi
  // qua query string. Không có mã trên URL thì cũng không có ca thiếu mã.
  'auth.reset.meta-title': 'Đặt lại mật khẩu · DevOps Learning Platform',
  'auth.reset.title': 'Đặt lại mật khẩu',
  'auth.reset.description':
    'Nhập mã trong email đặt lại mật khẩu và chọn mật khẩu mới cho tài khoản của bạn.',
  'auth.reset.code': 'Mã đặt lại mật khẩu',
  'auth.reset.code-hint': 'Sao chép mã trong email đặt lại mật khẩu.',
  'auth.reset.pending': 'Đang đổi mật khẩu…',
  'auth.reset.success-title': 'Đã đổi mật khẩu',
  'auth.reset.success-body':
    'Bạn có thể đăng nhập bằng mật khẩu mới. Các phiên đăng nhập cũ đã được kết thúc.',
  'auth.mail.reset-subject': 'Mã đặt lại mật khẩu DevOps PTIT',
  'auth.mail.reset-body': (p: { code: string; url: string }) =>
    `Bạn vừa yêu cầu đặt lại mật khẩu DevOps PTIT.\n\nMã đặt lại mật khẩu: ${p.code}\n\nMở trang này và nhập mã cùng mật khẩu mới:\n${p.url}\n\nMã có hiệu lực trong 15 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.`,
  'auth.reset.submit': 'Đặt mật khẩu mới',
  'auth.reset.back': 'Quay lại đăng nhập',

  // ── Lỗi ─────────────────────────────────────────────────────────────────
  //
  // Bốn mục, và bốn ca thật sự khác nhau ở chỗ NGƯỜI DÙNG PHẢI LÀM GÌ TIẾP:
  // sai thông tin thì gõ lại, email trùng thì đi đăng nhập, hai ô lệch thì gõ
  // lại một ô, mạng chết thì chưa biết gì hết và không được gõ lại một cách mù.
  'auth.error.sign-in': {
    what: 'Đăng nhập không thành công.',
    next: 'Kiểm tra lại email và mật khẩu rồi thử lần nữa. Nếu không nhớ mật khẩu, dùng liên kết ngay dưới nút.',
  } satisfies ErrorEntry,
  'auth.error.reset-request': {
    what: 'Chưa gửi được yêu cầu đặt lại mật khẩu.',
    next: 'Thử lại sau ít phút. Nếu vẫn gặp lỗi, liên hệ quản trị viên lớp để kiểm tra đường gửi thư.',
  } satisfies ErrorEntry,
  'auth.error.reset-invalid': {
    what: 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
    next: 'Yêu cầu một mã mới rồi sao chép đầy đủ mã trong email gần nhất.',
  } satisfies ErrorEntry,
  'auth.error.sign-up': {
    what: 'Tạo tài khoản không thành công.',
    next: 'Kiểm tra lại email và mật khẩu rồi thử lần nữa. Nếu email này đã có tài khoản, hãy đăng nhập thay vì đăng ký.',
  } satisfies ErrorEntry,
  'auth.error.password-mismatch': {
    what: 'Hai ô mật khẩu chưa khớp nhau.',
    next: 'Nhập lại mật khẩu mới ở cả hai ô rồi gửi lại.',
  } satisfies ErrorEntry,
  'auth.error.network': {
    what: 'Không gọi được máy chủ nên chưa biết yêu cầu vừa rồi có thành công hay không.',
    next: 'Kiểm tra kết nối mạng rồi thử lại. Đừng bấm liên tục: mỗi lần bấm là một yêu cầu nữa.',
  } satisfies ErrorEntry,
} as const satisfies Surface<'auth'>;

/**
 * Không có nhóm ba nào trong surface này, và bảng rỗng là câu trả lời đúng.
 *
 * Bảng này KHÔNG được để rỗng như một chỗ trống chờ điền: vế thứ hai của T3
 * bắt một miễn trừ không còn khớp gì, nên thêm một dòng phòng xa ở đây là tự
 * tạo ra một ô đỏ. Hai chỗ suýt thành nhóm ba đã được đặt lại tên thay vì khai
 * miễn trừ: `auth.oauth.divider` chuyển thành `auth.form.divider` (nó là phần
 * của form, không phải của nhóm nhà cung cấp), và nhóm lỗi có bốn mục vì ca
 * mạng chết là một ca thật, không phải mục độn thêm cho đủ bốn.
 */
export const authIntentionalThree = {} as const satisfies IntentionalThree;
