import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `shell.`, sở hữu bởi lane 16.B (L1). Phủ vỏ ứng dụng: thanh đầu
 * trang, ngăn kéo điều hướng ≤768px, menu tài khoản, nút giao diện, dải báo
 * sức chứa, và cảnh báo màn hình hẹp.
 *
 * ## Tên sản phẩm chính tắc được khai ở ĐÂY
 *
 * `shell.brand.name` là bản chính tắc, theo quyết định của lead, và nay là bản
 * DUY NHẤT. Lane 16.E từng giữ một bản riêng ở `home.og.title` cho thẻ Open
 * Graph; hai bản cùng tồn tại có chủ ý cho tới khi mọi lane gộp xong, và lượt
 * gộp đó đã làm (2026-09-13): `home.og.title` cùng `home.og.subtitle` bị xoá vì
 * chúng giống TỪNG KÝ TỰ với `shell.brand.name` và `common.og-description`,
 * hai khoá mà `app/layout.tsx` đang thật sự đọc cho khối `openGraph`.
 *
 * Ba biến thể độ dài là ba chuỗi khác nhau chứ không phải một chuỗi bị cắt:
 * ở 360px thanh đầu trang phải chứa nút menu, tên, nút giao diện và avatar,
 * nên tên rút về `shell.brand.short`. Bản đầy đủ vẫn nằm trong `sr-only` để
 * trình đọc màn hình và phép kiểm a11y luôn nghe đủ tên.
 *
 * ## Bộ chọn của lane trả về CÂU, không trả về `CopyRef`
 *
 * Cùng lựa chọn và cùng lý lẽ với lane 16.F (xem đầu `admin.ts`): mọi nhánh
 * của `describeCapacity` và `describeProfileCapacity` là một khoá trong bản đồ
 * dưới đây, nên bộ dò phủ 100% ở cả hai cách, còn gọi `t()` thẳng thì giữ được
 * phép kiểm tham số ở tầng biên dịch.
 *
 * ## Ba chuỗi sức chứa cũ mang U+2014, đã viết lại
 *
 * `capacity.ts` dòng 207 và 303 (`Sắp hết chỗ`, rồi U+2014, rồi `nếu bạn...`)
 * và `capacity-indicator.tsx` dòng 138 (`Số liệu có thể đã cũ`, rồi U+2014) vi
 * phạm luật 3 của design §5 và đi lọt vì trước P16 chưa cổng nào quét vùng
 * này. Viết lại bằng dấu phẩy và tách mệnh đề, không thay bằng một ký tự trông
 * giống. Ký tự đó được GỌI TÊN ở đây chứ không gõ ra, theo đúng cách hợp đồng
 * `p16-copy.md` tự xử lý cùng vấn đề.
 */
export const shell = {
  // ── Nhận diện ───────────────────────────────────────────────────────────
  'shell.brand.name': 'DevOps Learning Platform',
  'shell.brand.medium': 'DevOps Learning',
  'shell.brand.short': 'DLP',
  'shell.brand.home': 'DevOps Learning Platform, về trang chủ',
  // Dòng chữ nhỏ dưới tên trong khối nhận diện ở thanh bên. Giữ nguyên tiếng
  // Anh viết hoa: đây là một phần của khối nhận diện, cùng loại với tên sản
  // phẩm, không phải một câu để đọc.
  'shell.brand.tagline': 'PRACTICE SPACE',

  // ── Đường tắt bàn phím ──────────────────────────────────────────────────
  //
  // Giữ cả ở chế độ immersive: không có thanh đầu trang thì nó chỉ còn là
  // đường tắt tới `<main>`, vô hại, và bỏ nó đi làm phần tử focus được đầu
  // tiên của trang đổi theo route.
  'shell.skip.label': 'Bỏ qua điều hướng',

  // ── Thanh đầu trang ─────────────────────────────────────────────────────
  'shell.header.sign-in': 'Đăng nhập',

  // ── Điều hướng chính ────────────────────────────────────────────────────
  //
  // ⚠ Bảy nhãn dưới đây là HỢP ĐỒNG C6, không phải chữ trang trí.
  // `components/shell/nav.test.ts` ghim từng chữ, và `e2e/keyboard.spec.ts`
  // tìm liên kết bằng `{ name: label, exact: true }`. Đổi một chữ ở đây là đổi
  // hai cổng, và một trong hai nằm ngoài lane này.
  'shell.nav.aria': 'Điều hướng chính',
  'shell.nav.aria-collapsed': 'Điều hướng chính (thu gọn)',
  'shell.nav.lessons': 'Bài học',
  'shell.nav.labs': 'Lab',
  'shell.nav.playgrounds': 'Playground',
  'shell.nav.paths': 'Lộ trình',
  'shell.nav.quiz': 'Quiz',
  'shell.nav.games': 'Games',
  'shell.nav.problems': 'Bài tập',
  'shell.nav.exams': 'Kỳ thi',
  'shell.nav.me': 'Của tôi',

  // Ba mục chỉ author/admin thấy, và ba mục chỉ admin thấy. Nhãn của `/author`
  // và `/admin` KHÔNG khai lại ở đây: chúng dùng lại `shell.account.menu.author`
  // và `shell.account.menu.admin`, vì cùng một đích thì cùng một chữ, và hai
  // khoá mang cùng một câu là hai chỗ để trôi khỏi nhau.
  'shell.nav.author-problems': 'Soạn bài tập',
  'shell.nav.level-builder': 'Dựng màn chơi',
  'shell.nav.admin-exams': 'Tổ chức kỳ thi',
  'shell.nav.admin-classes': 'Lớp học',

  // Tiêu đề nhóm trong thanh điều hướng. Viết HOA vì đó là chữ thật của tiêu
  // đề, không phải một hiệu ứng `text-transform` mà trình đọc màn hình đọc
  // khác với thứ mắt thấy.
  //
  // Nhóm thứ năm (tài khoản) KHÔNG có khoá riêng ở đây: nó dùng lại
  // `shell.account.group`, khoá vốn sinh ra để làm nhãn nhóm tài khoản.
  'shell.nav.group.learn': 'THỰC HÀNH',
  'shell.nav.group.library': 'THƯ VIỆN',
  'shell.nav.group.studio': 'STUDIO',
  'shell.nav.group.manage': 'QUẢN LÝ',

  // ── Ngăn kéo ≤768px ─────────────────────────────────────────────────────
  'shell.drawer.open': 'Mở điều hướng',
  'shell.drawer.title': 'Điều hướng',

  // ── Thanh bên ───────────────────────────────────────────────────────────
  //
  // `shell.sidebar.aria` là TÊN của landmark `complementary` mà `<aside
  // class="practice-sidebar">` tạo ra. Không phải chữ trang trí: axe có luật
  // `landmark-unique`, và hai landmark cùng vai mà cùng VÔ DANH thì bị tính là
  // trùng. Màn sandbox Git dựng landmark `complementary` thứ hai
  // (`git-sandbox.tsx`), nên trước khi có khoá này `a11y.spec.ts` đỏ ở đó.
  // Đặt tên cho MỘT trong hai là đủ để hai cái phân biệt được.
  //
  // Đặt tên cho cái của vỏ ứng dụng chứ không cho cái của trò chơi là có chủ
  // ý: thanh bên này có mặt trên MỌI màn không-xác-thực, nên một cái tên ở đây
  // đóng luôn cả những màn chưa ai mở, kể cả màn level của Git, nơi
  // `git-level-screen.tsx` cũng dựng một `<aside>` cùng loại.
  'shell.sidebar.aria': 'Thanh bên điều hướng',
  'shell.sidebar.tagline': 'Học bằng thực hành',

  // ── Menu tài khoản ──────────────────────────────────────────────────────
  //
  // `shell.account.trigger` là tên khả truy cập của một nút CHỈ CÓ avatar hai
  // chữ cái. Thiếu nó thì nút vô danh với trình đọc màn hình; hai chữ cái đọc
  // lên cũng vô nghĩa nên avatar mang `aria-hidden`.
  'shell.account.trigger': 'Tài khoản',
  'shell.account.trigger-named': (p: { name: string }) => `Tài khoản của ${p.name}`,
  'shell.account.fallback-name': 'Tài khoản',
  'shell.account.group': 'Tài khoản',
  'shell.account.sign-out': 'Đăng xuất',
  'shell.account.signing-out': 'Đang đăng xuất…',

  // Ba mục theo vai trò. Xem `shellIntentionalThree` ở cuối file.
  'shell.account.menu.settings': 'Hồ sơ & cài đặt',
  'shell.account.menu.author': 'Soạn bài',
  'shell.account.menu.admin': 'Quản trị',

  // ── Giao diện sáng / tối / theo hệ thống ────────────────────────────────
  //
  // Nút chỉ có icon nên `shell.theme.label` là tên khả truy cập của nó, và
  // cũng là nhãn nhóm trong menu. MỘT khoá cho cả hai chỗ: hai khoá mang cùng
  // một câu là hai chỗ để trôi khỏi nhau.
  'shell.theme.label': 'Giao diện',
  'shell.theme.current': '(đang dùng)',
  'shell.theme.choice.light': 'Sáng',
  'shell.theme.choice.dark': 'Tối',
  'shell.theme.choice.system': 'Theo hệ thống',

  // ── Đăng xuất thất bại ──────────────────────────────────────────────────
  //
  // KHÔNG điều hướng khi thu hồi thất bại: cookie phiên vẫn còn nên `/login`
  // sẽ bị proxy đẩy ngược về `/me`, và người dùng kết luận "bấm đăng xuất
  // không ăn thua" mà không biết vì sao. Câu `next` phải nói ra lối thoát trên
  // máy chung, vì đó là ca duy nhất mà thất bại này thật sự nguy hiểm.
  'shell.sign-out.failed-title': 'Chưa đăng xuất được',
  'shell.error.sign-out': {
    what: 'Máy chủ không phản hồi nên phiên của bạn chưa bị thu hồi.',
    next: 'Kiểm tra kết nối rồi bấm Đăng xuất lần nữa. Nếu đang dùng máy chung, hãy đóng hẳn trình duyệt.',
  } satisfies ErrorEntry,

  // ── Sức chứa: nhãn và câu mô tả ─────────────────────────────────────────
  //
  // `null` = CHƯA BIẾT còn mấy chỗ, và nó khác hẳn 0. Hai nhánh dưới đây giữ
  // đúng sự phân biệt đó: `unread` là lượt đọc lỗi, `unknown` là máy chủ trả
  // lời nhưng không đọc được hạn mức của cụm.
  'shell.capacity.load': (p: { active: number; soft: number; hard: number }) =>
    `Đang chạy ${String(p.active)}/${String(p.soft)} phiên (trần cứng ${String(p.hard)}).`,
  'shell.capacity.full-label': 'Hết chỗ',
  'shell.capacity.low-label': (p: { remaining: number }) => `Chỉ còn ${String(p.remaining)} chỗ`,
  'shell.capacity.ok-label': (p: { remaining: number }) => `Còn ${String(p.remaining)} chỗ`,
  'shell.capacity.full-detail': (p: { load: string; note: string }) =>
    `${p.load} Bắt đầu phiên mới lúc này sẽ bị từ chối. Chờ vài phút rồi thử lại, hoặc kết thúc một phiên đang mở ở trang Của tôi.${p.note}`,
  'shell.capacity.low-detail': (p: { load: string; note: string }) =>
    `${p.load} Sắp hết chỗ, nếu bạn định làm lab thì hãy bắt đầu sớm.${p.note}`,
  'shell.capacity.ok-detail': (p: { load: string; note: string }) => `${p.load}${p.note}`,
  'shell.capacity.profile-load': (p: { remaining: number; total: number; scope: string }) =>
    `Còn ${String(p.remaining)}/${String(p.total)} chỗ ${p.scope}.`,
  'shell.capacity.scope-default': 'cho bài thường',
  'shell.capacity.scope-profile': 'cho bài này',
  'shell.capacity.profile-note':
    ' Bài có IDE hoặc lab Kubernetes tốn nhiều tài nguyên hơn nên có trần riêng, thấp hơn số này.',

  // ── Sức chứa: badge và dải cảnh báo ─────────────────────────────────────
  'shell.capacity.full-title': 'Sandbox đã kín chỗ',
  'shell.capacity.unread-badge': 'Chưa đọc được sức chứa',
  'shell.capacity.unread-body': (p: { error: string }) =>
    `${p.error} Số chỗ trống sẽ tự hiện lại khi máy chủ trả lời. Nếu vẫn trống sau vài phút, hãy tải lại trang.`,
  'shell.capacity.unknown-badge': 'Chưa rõ sức chứa',
  'shell.capacity.unknown-body':
    'Máy chủ chưa đọc được hạn mức tài nguyên của cụm nên số chỗ trống chưa tính được. Bạn vẫn bấm Bắt đầu được, và nếu hết chỗ thật thì phiên sẽ bị từ chối kèm lý do.',
  'shell.capacity.quota-reason': (p: { reason: string }) => `Lý do: ${p.reason}`,
  'shell.capacity.read-at': (p: { at: string }) => `Đọc lúc ${p.at}.`,
  'shell.capacity.stale': (p: { error: string }) =>
    `Số liệu có thể đã cũ, lượt đọc gần nhất lỗi: ${p.error}`,

  // ── Màn hình hẹp ────────────────────────────────────────────────────────
  //
  // Một câu cho một tình huống: lane D1/D2 IMPORT `NarrowScreenNotice` thay vì
  // tự viết câu riêng, vì ba câu khác nhau cho cùng một tình huống là ba câu
  // sẽ trôi khỏi nhau.
  'shell.narrow.title': (p: { minWidth: number }) =>
    `Cần màn hình rộng hơn (≥${String(p.minWidth)}px) để mở terminal`,
  'shell.narrow.body':
    'Terminal cần ít nhất 80 cột để lệnh không bị ngắt dòng giữa chừng. Hãy xoay ngang thiết bị hoặc mở lại trang này trên máy tính. Phần nội dung bài học phía trên vẫn đọc và học được bình thường.',
} as const satisfies Surface<'shell'>;

/**
 * Hai nhóm đúng ba, và cả hai được LỒNG một tầng có chủ ý.
 *
 * `groupBySiblingPrefix` gom theo tiền tố có dấu chấm, nên ba khoá đặt phẳng
 * cạnh sáu khoá anh em khác đi qua T3 vô hình. Lồng chúng xuống một tầng là
 * cách duy nhất để cổng NHÌN THẤY nhóm ba và bắt phải khai lý do. Lane 16.C2
 * đã phải làm đúng việc này ở commit 92804b7 sau khi phát hiện điểm mù.
 */
export const shellIntentionalThree = {
  'shell.theme.choice':
    '2026-09-10: đúng ba giá trị của union ThemeChoice khai tại packages/ui/src/theme/theme-provider.tsx dòng 14 (light, dark, system), và bảng CHOICES trong theme-toggle.tsx là danh sách đóng trên union đó nên lựa chọn thứ tư là lỗi biên dịch trước khi là một nhãn thiếu.',
  'shell.account.menu':
    '2026-09-10: đúng ba mục trong USER_MENU_NAV tại components/shell/nav.ts, và ba mục đó ánh xạ một-một sang ba giá trị của ViewerRole (user, author, admin), thứ chính là pgEnum user_role ở server/db/schema.ts. Vai trò thứ tư nào cũng phải sửa enum DB trước.',
} as const satisfies IntentionalThree;
