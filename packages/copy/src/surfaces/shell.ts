import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `shell.`: vỏ ứng dụng của bản dựng lại 2026-10. Thanh trên cùng với sáu mục
 * cha, thanh mục con của từng mục, trang tổng quan của mục, bảng lệnh (Ctrl K), menu
 * tài khoản, chọn giao diện, chỉ báo chỗ trống, chân trang.
 *
 * Giọng văn: docs/design-system.md mục "Chữ". Câu ngắn, nói việc cụ thể, xưng "bạn",
 * giữ thuật ngữ kỹ thuật tiếng Anh khi dân trong nghề vẫn nói vậy.
 */
export const shell = {
  // ── Nhận diện ───────────────────────────────────────────────────────────
  'shell.brand.name': 'DevOps Lab',
  'shell.brand.title': 'DevOps Lab, PTIT',
  'shell.brand.home': 'DevOps Lab, về trang đầu',
  'shell.brand.org': 'Học viện Công nghệ Bưu chính Viễn thông',

  'shell.skip.label': 'Bỏ qua điều hướng',

  // ── Thanh trên cùng ─────────────────────────────────────────────────────
  'shell.header.sign-in': 'Đăng nhập',
  'shell.header.register': 'Tạo tài khoản',
  'shell.nav.aria': 'Điều hướng chính',
  'shell.nav.aria-collapsed': 'Điều hướng chính (thu gọn)',
  'shell.subnav.aria': (p: { section: string }) => `Các trang trong mục ${p.section}`,
  'shell.menu.open': 'Mở điều hướng',
  'shell.menu.close': 'Đóng điều hướng',
  'shell.menu.title': 'Điều hướng',

  // ── Mục cha ─────────────────────────────────────────────────────────────
  'shell.section.learn': 'Học',
  'shell.section.learn.lead': 'Đọc hướng dẫn, gõ lệnh ngay trên máy ảo bên cạnh. Bước nào cũng có nút kiểm tra.',
  'shell.section.practice': 'Thực hành',
  'shell.section.practice.lead': 'Không có hướng dẫn từng bước: bạn nhận đề, tự làm, máy chấm theo từng nhiệm vụ.',
  'shell.section.judge': 'Luyện đề',
  'shell.section.judge.lead': 'Đề chấm tự động trên game Kubernetes, Git và CI/CD. Thi có giờ thì vào Kỳ thi.',
  'shell.section.games': 'Trò chơi',
  'shell.section.games.lead': 'Chơi ngay trong trình duyệt, không cần máy ảo và không cần đăng nhập.',
  'shell.section.studio': 'Soạn bài',
  'shell.section.studio.lead': 'Viết bài học và lab, ra đề cho hệ chấm, dựng màn chơi Git.',
  'shell.section.admin': 'Quản trị',
  'shell.section.admin.lead': 'Tài khoản, lớp, kỳ thi, máy ảo đang chạy và nhật ký thao tác.',
  'shell.section.overview': 'Tổng quan',

  // ── Trang con ───────────────────────────────────────────────────────────
  'shell.nav.paths': 'Lộ trình',
  'shell.nav.paths.desc': 'Chuỗi bài xếp sẵn thứ tự. Học hết một chuỗi là nắm được một mảng.',
  'shell.nav.lessons': 'Bài học',
  'shell.nav.lessons.desc': 'Từng bước có hướng dẫn, terminal mở sẵn bên cạnh.',
  'shell.nav.quiz': 'Trắc nghiệm',
  'shell.nav.quiz.desc': 'Vài câu ngắn để tự kiểm lại phần vừa học.',
  'shell.nav.labs': 'Lab',
  'shell.nav.labs.desc': 'Đề theo nhiệm vụ, không gợi ý. Script chấm từng nhiệm vụ.',
  'shell.nav.playgrounds': 'Sân chơi',
  'shell.nav.playgrounds.desc': 'Máy trống có hạn giờ, cài gì phá gì cũng được.',
  'shell.nav.problems': 'Bài tập',
  'shell.nav.problems.desc': 'Kho đề chấm tự động, lọc theo game, chủ đề, độ khó.',
  'shell.nav.exams': 'Kỳ thi',
  'shell.nav.exams.desc': 'Kỳ thi của lớp bạn, có đồng hồ đếm ngược.',
  'shell.nav.game-k8s': 'Kubernetes',
  'shell.nav.game-k8s.desc': 'Cứu một cụm đang hỏng bằng kubectl.',
  'shell.nav.game-git': 'Git',
  'shell.nav.game-git.desc': 'Gõ git thật trên một kho mô phỏng.',
  'shell.nav.game-cicd': 'CI/CD',
  'shell.nav.game-cicd.desc': 'Viết workflow, đọc kết quả chạy, đưa bản lên production.',
  'shell.nav.author': 'Bài học và lab',
  'shell.nav.author.desc': 'Bản nháp, bản đã xuất bản và các lượt chạy thử.',
  'shell.nav.author-problems': 'Đề bài',
  'shell.nav.author-problems.desc': 'Ra đề cho hệ chấm: trạng thái đầu, mục tiêu, gợi ý.',
  'shell.nav.level-builder': 'Dựng màn Git',
  'shell.nav.level-builder.desc': 'Dựng màn chơi bằng chính lệnh git rồi lưu thành đề.',
  'shell.nav.admin-users': 'Tài khoản',
  'shell.nav.admin-users.desc': 'Tìm người dùng, đổi vai trò.',
  'shell.nav.admin-classes': 'Lớp học',
  'shell.nav.admin-classes.desc': 'Tạo lớp, thêm sinh viên, xem điểm cả lớp.',
  'shell.nav.admin-exams': 'Kỳ thi',
  'shell.nav.admin-exams.desc': 'Mở kỳ thi, chọn đề, theo dõi bảng điểm.',
  'shell.nav.admin-sessions': 'Máy đang chạy',
  'shell.nav.admin-sessions.desc': 'Mọi sandbox đang mở, dừng được từng máy.',
  'shell.nav.admin-content': 'Nội dung',
  'shell.nav.admin-content.desc': 'Bài của mọi tác giả, lưu trữ khi cần.',
  'shell.nav.admin-audit': 'Nhật ký',
  'shell.nav.admin-audit.desc': 'Ai đã làm gì, mới nhất ở trên.',

  // ── Bảng lệnh (Ctrl K) ──────────────────────────────────────────────────
  'shell.command.open': 'Tìm trang',
  'shell.command.label': 'Tìm và mở trang',
  'shell.command.placeholder': 'Gõ tên trang, ví dụ "lab" hoặc "kỳ thi"',
  'shell.command.empty': 'Không có trang nào khớp.',
  'shell.command.group.account': 'Tài khoản',
  'shell.command.footer-move': 'Lên xuống để chọn',
  'shell.command.footer-open': 'Enter để mở',

  // ── Tài khoản ───────────────────────────────────────────────────────────
  'shell.account.trigger-named': (p: { name: string }) => `Tài khoản của ${p.name}`,
  'shell.account.fallback-name': 'Bạn',
  'shell.account.sign-out': 'Đăng xuất',
  'shell.account.menu.me': 'Trang của tôi',
  'shell.account.menu.settings': 'Cài đặt',
  'shell.account.role.user': 'Sinh viên',
  'shell.account.role.author': 'Tác giả',
  'shell.account.role.admin': 'Quản trị viên',

  // ── Giao diện ───────────────────────────────────────────────────────────
  'shell.theme.label': 'Giao diện',
  'shell.theme.choice.light': 'Sáng',
  'shell.theme.choice.dark': 'Tối',
  'shell.theme.choice.system': 'Theo máy',

  'shell.sign-out.failed-title': 'Chưa đăng xuất được',
  'shell.error.sign-out': {
    what: 'Máy chủ không trả lời nên phiên đăng nhập vẫn còn.',
    next: 'Kiểm tra mạng rồi bấm Đăng xuất lần nữa. Nếu đang dùng máy chung, hãy đóng hẳn trình duyệt.',
  } satisfies ErrorEntry,

  // ── Chỗ trống của cụm sandbox ───────────────────────────────────────────
  'shell.capacity.full-label': 'Hết chỗ',
  'shell.capacity.low-label': (p: { remaining: number }) => `Chỉ còn ${String(p.remaining)} chỗ`,
  'shell.capacity.ok-label': (p: { remaining: number }) => `Còn ${String(p.remaining)} chỗ`,
  'shell.capacity.load': (p: { active: number; soft: number; hard: number }) =>
    `${String(p.active)} máy đang chạy, mức thường ${String(p.soft)}, tối đa ${String(p.hard)}.`,
  'shell.capacity.full-detail': (p: { load: string; note: string }) =>
    `${p.load} Mở máy mới lúc này sẽ bị từ chối. Thử lại sau vài phút, hoặc tắt bớt máy bạn đang mở ở Trang của tôi.${p.note}`,
  'shell.capacity.low-detail': (p: { load: string; note: string }) =>
    `${p.load} Sắp kín chỗ. Định làm lab thì mở máy sớm.${p.note}`,
  'shell.capacity.ok-detail': (p: { load: string; note: string }) => `${p.load}${p.note}`,
  'shell.capacity.profile-load': (p: { remaining: number; total: number; scope: string }) =>
    `Còn ${String(p.remaining)}/${String(p.total)} chỗ ${p.scope}.`,
  'shell.capacity.scope-default': 'cho bài thường',
  'shell.capacity.scope-profile': 'cho bài này',
  'shell.capacity.profile-note': ' Bài có IDE hoặc lab Kubernetes dùng máy lớn hơn nên có trần riêng.',
  'shell.capacity.full-title': 'Cụm sandbox đã kín chỗ',
  'shell.capacity.unread-badge': 'Chưa đọc được số chỗ',
  'shell.capacity.unread-body': (p: { error: string }) =>
    `${p.error} Số chỗ sẽ tự hiện lại khi máy chủ trả lời.`,
  'shell.capacity.unknown-badge': 'Chưa rõ số chỗ',
  'shell.capacity.unknown-body':
    'Máy chủ chưa đọc được hạn mức của cụm. Bạn vẫn mở máy được; nếu thật sự hết chỗ, hệ thống sẽ báo lý do.',
  'shell.capacity.quota-reason': (p: { reason: string }) => `Lý do: ${p.reason}`,
  'shell.capacity.read-at': (p: { at: string }) => `Cập nhật lúc ${p.at}.`,
  'shell.capacity.stale': (p: { error: string }) => `Số này có thể đã cũ vì lần đọc gần nhất bị lỗi: ${p.error}`,

  // ── Chân trang ──────────────────────────────────────────────────────────
  'shell.footer.aria': 'Chân trang',
  'shell.footer.note': 'Đề tài nghiên cứu khoa học của sinh viên khoa Công nghệ thông tin.',
  'shell.footer.source': 'Máy ảo chạy trên cụm Kubernetes của phòng lab.',
} as const satisfies Surface<'shell'>;

/** Nhóm đúng ba có chủ ý. */
export const shellIntentionalThree = {
  'shell.theme.choice':
    '2026-09-10: đúng ba giá trị của union ThemeChoice (light, dark, system); bảng chọn trong theme-toggle.tsx là danh sách đóng trên union đó.',
  'shell.footer':
    '2026-10-20: chân trang có đúng ba chỗ chữ: tên landmark cho trình đọc màn hình, một câu về đề tài, một dòng về nơi chạy máy ảo.',
  'shell.account.role':
    '2026-10-03: đúng ba giá trị của ViewerRole (user, author, admin), tức pgEnum user_role ở server/db/schema.ts.',
  'shell.menu':
    '2026-10-20: menu toàn màn trên điện thoại có đúng ba chỗ chữ: nút mở, nút đóng và tiêu đề của hộp thoại.',
} as const satisfies IntentionalThree;
