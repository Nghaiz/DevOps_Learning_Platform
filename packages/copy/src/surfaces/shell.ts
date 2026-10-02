import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `shell.`: vỏ ứng dụng của bản dựng lại PTIT (2026-10-03). Header trên
 * cùng với các section, mega menu, bảng lệnh (Ctrl K), menu tài khoản, nút giao
 * diện, chỉ báo sức chứa, chân trang.
 *
 * Giọng văn theo `plans/fe-ptit-rebuild/design-brief.md` §8: câu ngắn, nói việc
 * cụ thể, giữ nguyên thuật ngữ kỹ thuật tiếng Anh khi người ta vẫn nói vậy.
 *
 * ⚠ Nhãn section và trang con được `components/shell/nav.test.ts` ghim từng chữ.
 * Đổi chữ ở đây thì sửa luôn bảng ghim đó.
 */
export const shell = {
  // ── Nhận diện ───────────────────────────────────────────────────────────
  'shell.brand.name': 'PTIT DevOps Lab',
  'shell.brand.medium': 'DevOps Lab',
  'shell.brand.home': 'PTIT DevOps Lab, về trang chủ',
  'shell.brand.org': 'Học viện Công nghệ Bưu chính Viễn thông',

  'shell.skip.label': 'Bỏ qua điều hướng',

  // ── Header ─────────────────────────────────────────────────────────────
  'shell.header.sign-in': 'Đăng nhập',
  'shell.header.register': 'Tạo tài khoản',
  'shell.nav.aria': 'Điều hướng chính',
  'shell.nav.aria-collapsed': 'Điều hướng chính (thu gọn)',
  'shell.menu.open': 'Mở điều hướng',
  'shell.menu.close': 'Đóng điều hướng',
  'shell.menu.title': 'Điều hướng',
  'shell.menu.section-open': (p: { section: string }) => `Mở danh sách mục ${p.section}`,
  'shell.menu.count': (p: { count: number }) => `${String(p.count)} mục`,
  'shell.crumbs.aria': 'Đường dẫn',
  'shell.switcher.aria': (p: { section: string }) => `Mục trong ${p.section}`,

  // ── Section (mục cha) ──────────────────────────────────────────────────
  'shell.section.learn': 'Học',
  'shell.section.learn.lead': 'Bài có hướng dẫn từng bước, chạy lệnh trên máy ảo thật.',
  'shell.section.practice': 'Thực hành',
  'shell.section.practice.lead': 'Tự làm, máy chấm từng nhiệm vụ. Hoặc mở máy trống mà vọc.',
  'shell.section.judge': 'Luyện đề',
  'shell.section.judge.lead': 'Đề có chấm tự động, dùng chung cho mọi game, và kỳ thi có giờ.',
  'shell.section.games': 'Trò chơi',
  'shell.section.games.lead': 'Học K8s, Git, CI/CD bằng màn chơi. Không cần đăng nhập.',
  'shell.section.studio': 'Xưởng soạn',
  'shell.section.studio.lead': 'Viết bài, ra đề, dựng màn chơi rồi xuất bản cho lớp.',
  'shell.section.admin': 'Quản trị',
  'shell.section.admin.lead': 'Người dùng, lớp, kỳ thi, phiên sandbox và nhật ký.',

  // ── Trang con ──────────────────────────────────────────────────────────
  'shell.nav.paths': 'Lộ trình',
  'shell.nav.paths.desc': 'Chuỗi bài xếp sẵn theo thứ tự, đi hết là nắm một mảng.',
  'shell.nav.lessons': 'Bài học',
  'shell.nav.lessons.desc': 'Làm theo từng bước, có terminal và IDE bên cạnh.',
  'shell.nav.quiz': 'Trắc nghiệm',
  'shell.nav.quiz.desc': 'Vài câu hỏi ngắn để tự kiểm lại phần vừa học.',
  'shell.nav.labs': 'Lab',
  'shell.nav.labs.desc': 'Đề theo nhiệm vụ, không gợi ý sẵn, chấm bằng script.',
  'shell.nav.playgrounds': 'Sân chơi',
  'shell.nav.playgrounds.desc': 'Máy trống có hạn giờ, thử gì cũng được.',
  'shell.nav.problems': 'Bài tập',
  'shell.nav.problems.desc': 'Đề chấm tự động cho K8s, Git và CI/CD.',
  'shell.nav.exams': 'Kỳ thi',
  'shell.nav.exams.desc': 'Kỳ thi thực hành của lớp bạn, có đồng hồ đếm ngược.',
  'shell.nav.games': 'Chọn game',
  'shell.nav.games.desc': 'Ba game, gần 100 màn, lưu tiến độ ngay trên máy bạn.',
  'shell.nav.author': 'Bài học và lab',
  'shell.nav.author.desc': 'Bản nháp, bản đã xuất bản và lượt chạy thử của bạn.',
  'shell.nav.author-problems': 'Đề bài',
  'shell.nav.author-problems.desc': 'Ra đề cho hệ chấm: trạng thái đầu, mục tiêu, gợi ý.',
  'shell.nav.level-builder': 'Dựng màn chơi',
  'shell.nav.level-builder.desc': 'Dựng màn Git bằng chính lệnh git, rồi lưu thành đề.',
  'shell.nav.admin': 'Tổng quan',
  'shell.nav.admin.desc': 'Sức chứa sandbox và tình trạng máy chủ lúc này.',
  'shell.nav.admin-users': 'Người dùng',
  'shell.nav.admin-users.desc': 'Tìm tài khoản, đổi vai trò.',
  'shell.nav.admin-classes': 'Lớp học',
  'shell.nav.admin-classes.desc': 'Tạo lớp, thêm sinh viên, xem bảng điểm.',
  'shell.nav.admin-exams': 'Kỳ thi',
  'shell.nav.admin-exams.desc': 'Mở kỳ thi, sửa giờ, tải bảng điểm CSV.',
  'shell.nav.admin-sessions': 'Phiên đang chạy',
  'shell.nav.admin-sessions.desc': 'Mọi sandbox đang mở, dừng được từng cái.',
  'shell.nav.admin-content': 'Nội dung',
  'shell.nav.admin-content.desc': 'Bài của mọi tác giả, lưu trữ khi cần.',
  'shell.nav.admin-audit': 'Nhật ký',
  'shell.nav.admin-audit.desc': 'Ai đã làm gì, mới nhất trước.',

  // ── Bảng lệnh (Ctrl K) ─────────────────────────────────────────────────
  'shell.command.open': 'Tìm nhanh',
  'shell.command.hint': 'Tìm trang, bài học, lab…',
  'shell.command.label': 'Ô tìm nhanh',
  'shell.command.title': 'Đi tới',
  'shell.command.empty': (p: { query: string }) => `Không có mục nào khớp "${p.query}".`,
  'shell.command.group.pages': 'Trang',
  'shell.command.group.account': 'Tài khoản',
  'shell.command.footer': 'Mũi tên để chọn, Enter để mở, Esc để đóng',

  // ── Menu tài khoản ─────────────────────────────────────────────────────
  'shell.account.trigger': 'Tài khoản',
  'shell.account.trigger-named': (p: { name: string }) => `Tài khoản của ${p.name}`,
  'shell.account.fallback-name': 'Tài khoản',
  'shell.account.sign-out': 'Đăng xuất',
  'shell.account.signing-out': 'Đang đăng xuất…',
  'shell.account.menu.me': 'Bàn học của tôi',
  'shell.account.menu.settings': 'Hồ sơ và cài đặt',
  'shell.account.menu.author': 'Xưởng soạn',
  'shell.account.menu.admin': 'Quản trị',
  'shell.account.role.user': 'Sinh viên',
  'shell.account.role.author': 'Tác giả',
  'shell.account.role.admin': 'Quản trị viên',

  // ── Giao diện ──────────────────────────────────────────────────────────
  'shell.theme.label': 'Giao diện',
  'shell.theme.current': '(đang dùng)',
  'shell.theme.choice.light': 'Sáng',
  'shell.theme.choice.dark': 'Tối',
  'shell.theme.choice.system': 'Theo máy',

  // ── Đăng xuất thất bại ─────────────────────────────────────────────────
  'shell.sign-out.failed-title': 'Chưa đăng xuất được',
  'shell.error.sign-out': {
    what: 'Máy chủ không trả lời nên phiên của bạn chưa bị thu hồi.',
    next: 'Kiểm tra mạng rồi bấm Đăng xuất lần nữa. Đang dùng máy chung thì đóng hẳn trình duyệt.',
  } satisfies ErrorEntry,

  // ── Sức chứa ───────────────────────────────────────────────────────────
  'shell.capacity.load': (p: { active: number; soft: number; hard: number }) =>
    `Đang chạy ${String(p.active)}/${String(p.soft)} phiên, trần cứng ${String(p.hard)}.`,
  'shell.capacity.full-label': 'Hết chỗ',
  'shell.capacity.low-label': (p: { remaining: number }) => `Còn ${String(p.remaining)} chỗ`,
  'shell.capacity.ok-label': (p: { remaining: number }) => `Còn ${String(p.remaining)} chỗ`,
  'shell.capacity.full-detail': (p: { load: string; note: string }) =>
    `${p.load} Mở phiên mới lúc này sẽ bị từ chối. Đợi vài phút, hoặc đóng bớt phiên ở Bàn học.${p.note}`,
  'shell.capacity.low-detail': (p: { load: string; note: string }) =>
    `${p.load} Sắp kín chỗ. Định làm lab thì mở phiên sớm.${p.note}`,
  'shell.capacity.ok-detail': (p: { load: string; note: string }) => `${p.load}${p.note}`,
  'shell.capacity.profile-load': (p: { remaining: number; total: number; scope: string }) =>
    `Còn ${String(p.remaining)}/${String(p.total)} chỗ ${p.scope}.`,
  'shell.capacity.scope-default': 'cho bài thường',
  'shell.capacity.scope-profile': 'cho bài này',
  'shell.capacity.profile-note':
    ' Bài có IDE hoặc lab Kubernetes tốn tài nguyên hơn nên có trần riêng, thấp hơn số này.',
  'shell.capacity.full-title': 'Sandbox đã kín chỗ',
  'shell.capacity.unread-badge': 'Chưa đọc được sức chứa',
  'shell.capacity.unread-body': (p: { error: string }) =>
    `${p.error} Số chỗ trống sẽ tự hiện lại khi máy chủ trả lời. Vài phút vẫn trống thì tải lại trang.`,
  'shell.capacity.unknown-badge': 'Chưa rõ sức chứa',
  'shell.capacity.unknown-body':
    'Máy chủ chưa đọc được hạn mức của cụm nên chưa tính được số chỗ. Bạn vẫn mở phiên được, hết chỗ thật thì sẽ bị từ chối kèm lý do.',
  'shell.capacity.quota-reason': (p: { reason: string }) => `Lý do: ${p.reason}`,
  'shell.capacity.read-at': (p: { at: string }) => `Đọc lúc ${p.at}.`,
  'shell.capacity.stale': (p: { error: string }) =>
    `Số liệu có thể đã cũ, lượt đọc gần nhất lỗi: ${p.error}`,

  // ── Chân trang ─────────────────────────────────────────────────────────
  'shell.footer.aria': 'Chân trang',
  'shell.footer.note': 'Đề tài nghiên cứu khoa học sinh viên, khoa Công nghệ thông tin.',
  'shell.footer.source': 'Máy ảo chạy trên cụm Kubernetes của phòng lab.',

  // ── Màn hình hẹp (dùng chung cho workspace) ────────────────────────────
  'shell.narrow.title': (p: { minWidth: number }) =>
    `Màn hình hẹp hơn ${String(p.minWidth)}px, terminal sẽ xếp bên dưới bài`,
  'shell.narrow.body':
    'Lệnh dài có thể xuống dòng. Xoay ngang máy hoặc mở trên laptop sẽ dễ làm hơn.',
} as const satisfies Surface<'shell'>;

/**
 * Nhóm đúng ba có chủ ý.
 */
export const shellIntentionalThree = {
  'shell.theme.choice':
    '2026-09-10: đúng ba giá trị của union ThemeChoice khai tại packages/ui/src/theme/theme-provider.tsx (light, dark, system), và bảng CHOICES trong theme-toggle.tsx là danh sách đóng trên union đó.',
  'shell.account.role':
    '2026-10-03: đúng ba giá trị của ViewerRole (user, author, admin), thứ chính là pgEnum user_role ở server/db/schema.ts; vai trò thứ tư phải sửa enum DB trước.',
} as const satisfies IntentionalThree;
