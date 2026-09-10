import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `auth.`, sở hữu bởi lane 16.B (L1). Phủ bốn màn xác thực:
 * `/login`, `/register`, `/forgot-password`, `/reset-password`.
 *
 * ## ⚠ Hai màn dưới CHƯA có đường gửi thư, và chữ ở đây phải nói ra điều đó
 *
 * `phase-16.md` 16.B: `/forgot-password` và `/reset-password` chưa có backend
 * gửi mail. Đợt này là frontend-only. Một form gửi vào hư không mà hiện "Đã
 * gửi mail, kiểm hộp thư của bạn" là nói dối người dùng, và nó hỏng ở đúng file
 * này chứ không ở tầng nào khác.
 *
 * Nên KHÔNG có khoá nào tên `sent`, `check-inbox` hay `email-sent` trong bản đồ
 * này. Thứ thay chỗ chúng là `auth.forgot.unavailable-*` và
 * `auth.reset.unavailable-*`, và cả hai nói thẳng rằng đường gửi chưa nối. Ngày
 * backend lên thì XOÁ chúng và thêm khoá thành công thật, đừng sửa câu tại chỗ
 * để nó nghe giống thành công.
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
  'auth.forgot.description':
    'Nhập email của tài khoản. Khi đường gửi thư được bật, bạn sẽ nhận một liên kết đặt lại mật khẩu.',
  'auth.forgot.submit': 'Gửi liên kết đặt lại',
  'auth.forgot.back': 'Quay lại đăng nhập',
  'auth.forgot.notice-title': 'Đường gửi thư chưa được bật',
  'auth.forgot.notice-body':
    'Máy chủ chưa nối phần gửi thư, nên biểu mẫu này chưa gửi được gì. Phần giao diện đã dựng xong và sẽ chạy ngay khi đường gửi lên.',
  'auth.forgot.unavailable-title': 'Không có thư nào được gửi đi',
  'auth.forgot.unavailable-body': (p: { email: string }) =>
    `Biểu mẫu đã nhận ${p.email} nhưng máy chủ chưa có đường gửi thư, nên không có thư nào đang trên đường tới hộp thư đó. Đừng chờ.`,
  'auth.forgot.unavailable-next':
    'Nhắn cho quản trị viên lớp để họ đặt lại mật khẩu giúp bạn, hoặc đăng nhập bằng Google hay Microsoft nếu tài khoản của bạn có liên kết sẵn.',

  // ── /reset-password ─────────────────────────────────────────────────────
  //
  // Màn này chỉ tới được từ một liên kết trong thư, mà thư thì chưa gửi được.
  // Nên nó có HAI trạng thái vắng backend, không phải một: thiếu token (vào
  // thẳng bằng tay), và có token nhưng không có nơi nào nhận.
  'auth.reset.meta-title': 'Đặt lại mật khẩu · DevOps Learning Platform',
  'auth.reset.title': 'Đặt lại mật khẩu',
  'auth.reset.description': 'Chọn mật khẩu mới cho tài khoản của bạn.',
  'auth.reset.submit': 'Đặt mật khẩu mới',
  'auth.reset.back': 'Quay lại đăng nhập',
  'auth.reset.no-token-title': 'Liên kết này thiếu mã đặt lại',
  'auth.reset.no-token-body':
    'Trang đặt lại mật khẩu chỉ mở được từ liên kết trong thư, và liên kết đó mang theo một mã dùng một lần. Địa chỉ bạn đang mở không có mã nào.',
  'auth.reset.unavailable-title': 'Chưa đổi được mật khẩu ở đây',
  'auth.reset.unavailable-body':
    'Máy chủ chưa nhận yêu cầu đặt lại mật khẩu, nên mật khẩu của bạn vẫn là mật khẩu cũ. Mọi thứ bạn vừa nhập không được lưu ở đâu cả.',
  'auth.reset.unavailable-next':
    'Nhắn cho quản trị viên lớp để họ đổi mật khẩu giúp bạn. Phần này bật lên cùng lúc với đường gửi thư.',

  // ── Lỗi ─────────────────────────────────────────────────────────────────
  //
  // Bốn mục, và bốn ca thật sự khác nhau ở chỗ NGƯỜI DÙNG PHẢI LÀM GÌ TIẾP:
  // sai thông tin thì gõ lại, email trùng thì đi đăng nhập, hai ô lệch thì gõ
  // lại một ô, mạng chết thì chưa biết gì hết và không được gõ lại một cách mù.
  'auth.error.sign-in': {
    what: 'Đăng nhập không thành công.',
    next: 'Kiểm tra lại email và mật khẩu rồi thử lần nữa. Nếu không nhớ mật khẩu, dùng liên kết ngay dưới nút.',
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
