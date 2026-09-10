import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `auth.`, sở hữu bởi lane 16.B (L1). Phủ bốn màn xác thực:
 * `/login`, `/register`, `/forgot-password`, `/reset-password`.
 *
 * ## Đường gửi thư ĐÃ NỐI (lane 16.D của đợt đóng nợ P16)
 *
 * Ở lượt 16.B, `/forgot-password` và `/reset-password` là giao diện không gọi
 * gì cả, và bản đồ này mang tám khoá `auth.forgot.notice-*`,
 * `auth.forgot.unavailable-*`, `auth.reset.unavailable-*` nói thẳng ra điều đó.
 * Chỉ dẫn để lại lúc ấy là: "ngày backend lên thì XOÁ chúng rồi thêm khoá thành
 * công thật, đừng sửa câu tại chỗ để nó nghe giống thành công."
 *
 * Lượt này làm đúng thế. Tám khoá kia đã bị xoá, không phải sửa lời. Thay chỗ
 * chúng là `auth.forgot.sent-*` (thư đã gửi thật), `auth.reset.no-link-*` (tới
 * trang mà không có liên kết hợp lệ) và `auth.reset.done-*` (đổi xong).
 *
 * ## Câu "đã gửi" KHÔNG được khẳng định email đó tồn tại
 *
 * `auth.forgot.sent-*` nói "nếu email đó có tài khoản", không nói "đã gửi tới
 * bạn". Đó không phải cách nói vòng: máy chủ trả CÙNG một phản hồi cho email có
 * thật và email không tồn tại, và câu chữ ở đây là nửa còn lại của lớp phòng thủ
 * đó. Một câu "Đã gửi thư tới ban@vidu.com" trong khi máy chủ im lặng bỏ qua sẽ
 * biến màn hình thành máy dò tài khoản, dù mọi mã trạng thái HTTP đều giống nhau.
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
    'Nhập email của tài khoản. Nếu email đó có tài khoản, bạn sẽ nhận một liên kết đặt lại mật khẩu.',
  'auth.forgot.submit': 'Gửi liên kết đặt lại',
  'auth.forgot.back': 'Quay lại đăng nhập',
  'auth.forgot.sent-title': 'Nếu email đó có tài khoản, thư đã được gửi',
  // Câu này nói "nếu", và chữ "nếu" là một quyết định bảo mật chứ không phải
  // một cách nói dè dặt. Xem khối chú thích đầu file.
  'auth.forgot.sent-body': (p: { email: string }) =>
    `Kiểm tra hộp thư ${p.email}, kể cả thư mục spam. Liên kết trong thư dùng được một lần và hết hạn sau 30 phút.`,
  'auth.forgot.sent-next':
    'Chưa thấy thư sau vài phút thì gửi lại yêu cầu, hoặc đăng nhập bằng Google hay Microsoft nếu tài khoản của bạn có liên kết sẵn.',

  // ── /reset-password ─────────────────────────────────────────────────────
  //
  // Màn này chỉ tới được từ một liên kết trong thư.
  //
  // ⛔ VẪN KHÔNG có khoá nào cho ca "liên kết thiếu mã trên URL". Luật 8 cấm mã
  // đi qua query string, và `security/rule-08-no-token-in-url.test.ts` grep cả
  // cây nguồn để ép. Trang này không đọc mã từ URL, nên không có ca đó.
  //
  // Ca THẬT mà `no-link-*` phủ thì khác hẳn: người dùng tới trang mà KHÔNG có
  // cookie do route đổi liên kết đặt (gõ thẳng địa chỉ, liên kết quá hạn 30
  // phút, hoặc vừa đổi mật khẩu xong nên cookie đã bị xoá).
  'auth.reset.meta-title': 'Đặt lại mật khẩu · DevOps Learning Platform',
  'auth.reset.title': 'Đặt lại mật khẩu',
  'auth.reset.description': 'Chọn mật khẩu mới cho tài khoản của bạn.',
  'auth.reset.submit': 'Đặt mật khẩu mới',
  'auth.reset.back': 'Quay lại đăng nhập',
  'auth.reset.no-link-title': 'Chưa có liên kết đặt lại nào đang mở',
  'auth.reset.no-link-body':
    'Trang này chỉ mở được từ liên kết trong thư đặt lại mật khẩu, và liên kết đó hết hạn sau 30 phút. Mật khẩu của bạn chưa đổi.',
  'auth.reset.no-link-next': 'Xin một liên kết mới ở trang Quên mật khẩu rồi bấm vào liên kết trong thư mới nhất.',
  'auth.reset.done-title': 'Đã đổi mật khẩu',
  'auth.reset.done-body':
    'Mật khẩu mới đã có hiệu lực và liên kết vừa dùng không còn giá trị. Đăng nhập lại bằng mật khẩu mới.',

  // ── Lỗi ─────────────────────────────────────────────────────────────────
  //
  // Bảy mục, và bảy ca thật sự khác nhau ở chỗ NGƯỜI DÙNG PHẢI LÀM GÌ TIẾP:
  // sai thông tin thì gõ lại, email trùng thì đi đăng nhập, hai ô lệch thì gõ
  // lại một ô, mạng chết thì chưa biết gì hết và không được gõ lại một cách mù.
  //
  // Ba mục cuối là của lane 16.D. `reset-link` và `password-too-short` KHÔNG
  // gộp được dù cùng xuất hiện trên một màn: một cái bảo đi xin liên kết mới,
  // cái kia bảo gõ lại tại chỗ, và gộp chúng là bắt người dùng đoán xem họ vừa
  // gặp cái nào.
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
  'auth.error.forgot': {
    what: 'Máy chủ từ chối yêu cầu đặt lại mật khẩu.',
    next: 'Kiểm tra lại địa chỉ email rồi gửi lần nữa. Nếu vẫn hỏng, nhắn cho quản trị viên lớp.',
  } satisfies ErrorEntry,
  'auth.error.reset-link': {
    what: 'Liên kết đặt lại mật khẩu không còn dùng được. Mật khẩu của bạn chưa đổi.',
    next: 'Xin một liên kết mới ở trang Quên mật khẩu, rồi bấm vào liên kết trong thư mới nhất. Mỗi liên kết chỉ dùng được một lần.',
  } satisfies ErrorEntry,
  'auth.error.password-too-short': {
    what: 'Mật khẩu mới ngắn hơn 8 ký tự nên máy chủ không nhận.',
    next: 'Gõ lại một mật khẩu dài từ 8 ký tự ở cả hai ô. Liên kết của bạn vẫn còn dùng được, không cần xin liên kết mới.',
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
