import type { Counted, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `session.`: màn thực hành (`components/session/**`) và ba trình học có
 * terminal, `/labs/<id>`, `/lessons/<id>`, `/playgrounds/<id>`, cộng cửa sổ
 * terminal riêng `/session/<id>/terminal`.
 *
 * Giọng: người trợ giảng đứng cạnh bàn lab. Câu ngắn, nói việc trước, không cảm
 * thán. Thuật ngữ quen tai giữ nguyên tiếng Anh (terminal, pod, shell, sandbox).
 *
 * ⛔ Không ký tự gạch ngang dài ở đâu trong file này, kể cả chú thích (luật V3).
 *
 * Ba thứ CỐ Ý không nằm ở đây: nhãn "Còn N chỗ" (`components/shell/capacity.ts`),
 * câu "phiên này không nhận được shell bạn chọn" (`components/me/preference-notices.ts`),
 * nhãn độ khó và tiến độ danh mục (`catalog.`).
 */
export const session = {
  // ── Pha phiên (`session-machine.ts`), khớp một-một với `SessionPhase` ──────
  'session.phase.idle': 'Chưa có phiên',
  'session.phase.creating': 'Đang tạo phiên…',
  'session.phase.connecting': 'Đang kết nối…',
  'session.phase.ready': 'Sandbox sẵn sàng',
  'session.phase.reconnecting': 'Mất kết nối, đang thử lại…',
  'session.phase.exited': 'Shell đã thoát',
  'session.phase.expired': 'Phiên đã kết thúc',
  'session.phase.error': 'Lỗi',

  // ── Sức chứa: nhánh CHƯA BIẾT và nhánh HẾT CHỖ (`components/session/capacity.ts`) ──
  'session.capacity.unknown-label': 'Chưa rõ sức chứa',
  'session.capacity.unknown-default': (p: { why: string }) =>
    `Chưa đọc được sức chứa nên không nói được còn mấy chỗ. ${p.why} Bạn vẫn bấm Bắt đầu được: nếu hết chỗ thì hệ thống từ chối và báo lại ngay.`,
  'session.capacity.unknown-profile': (p: { why: string }) =>
    `Chưa đọc được sức chứa cho loại bài này nên không nói được còn mấy chỗ. ${p.why} Bạn vẫn bấm Bắt đầu được: nếu hết chỗ thì hệ thống từ chối và báo lại ngay.`,
  'session.capacity.why-quota-unreadable': 'Máy chủ không đọc được hạn mức của cụm.',
  'session.capacity.why-quota-error': (p: { error: string }) =>
    `Máy chủ không đọc được hạn mức của cụm: ${p.error}.`,
  'session.capacity.why-no-profile-cap': 'Máy chủ chưa khai trần cho loại bài này.',
  'session.capacity.exhausted-default':
    'Sandbox đang đầy theo hạn mức đọc gần nhất. Bạn vẫn bấm Bắt đầu được: con số này là cận dưới, chưa tính máy đang ấm sẵn, nên có thể vẫn vào được. Nếu bị từ chối, hãy thử lại sau vài phút hoặc kết thúc một phiên khác bạn đang mở ở trang Của tôi.',
  'session.capacity.exhausted-profile':
    'Loại bài này đang hết chỗ theo hạn mức đọc gần nhất. Bạn vẫn bấm Bắt đầu được: con số này là cận dưới, chưa tính máy đang ấm sẵn, nên có thể vẫn vào được. Nếu bị từ chối, hãy thử lại sau vài phút hoặc kết thúc một phiên khác bạn đang mở ở trang Của tôi.',

  // ── Khung điều khiển phiên ───────────────────────────────────────────────
  'session.controls.start': 'Bắt đầu',
  'session.controls.restart': 'Làm lại',
  'session.controls.extend': 'Thêm giờ',
  'session.controls.end': 'Kết thúc phiên',
  'session.controls.hard-cap':
    'Phiên này đã chạm thời lượng tối đa. Kết thúc rồi mở phiên mới để làm tiếp.',
  'session.controls.ttl-remaining': (p: { minutes: number }) => `Còn ${p.minutes} phút`,
  'session.controls.ttl-preview': (p: { minutes: number }) => `Phiên kéo dài ${p.minutes} phút`,

  // ── Khoang terminal ──────────────────────────────────────────────────────
  // Nhãn a11y nêu đường thoát: `role="application"` tắt chế độ duyệt của trình đọc màn hình.
  'session.terminal.aria-label': 'Terminal sandbox. Nhấn Esc hai lần để rời khỏi terminal.',
  'session.terminal.aria-label-window':
    'Terminal sandbox, cửa sổ riêng. Nhấn Esc hai lần để rời khỏi terminal.',
  'session.terminal.booting': 'Đang mở terminal…',
  'session.terminal.empty': 'Bấm Bắt đầu để dựng sandbox và mở terminal.',
  'session.terminal.escape-hint-prefix': 'Nhấn',
  'session.terminal.escape-hint-suffix': 'để rời khỏi terminal',

  // ── Lớp phủ trên terminal theo pha ───────────────────────────────────────
  'session.overlay.elsewhere-title': 'Terminal đang mở ở cửa sổ riêng',
  'session.overlay.elsewhere-detail':
    'Mỗi phiên chỉ giữ được một kết nối terminal. Đưa về đây thì cửa sổ kia ngắt.',
  'session.overlay.reclaim': 'Đưa về đây',
  'session.overlay.reclaiming': 'Đang đưa terminal về đây…',
  'session.overlay.creating-detail': 'Đang xin một máy ảo trống cho bạn. Thường mất vài chục giây.',
  'session.overlay.connecting-detail': 'Máy ảo đã có. Đang mở kết nối tới shell.',
  'session.overlay.reconnecting-detail':
    'Kết nối vừa đứt. Hệ thống đang tự nối lại, những gì bạn làm trong máy vẫn còn.',
  'session.overlay.reconnect': 'Nối lại',
  'session.overlay.new-session': 'Mở phiên mới',
  'session.overlay.popup-blocked':
    'Trình duyệt chặn cửa sổ mới. Cho phép cửa sổ bật lên của trang này rồi bấm lại.',

  // ── Khoang làm việc (Editor + Terminal) ──────────────────────────────────
  'session.workspace.tablist': 'Khoang làm việc',
  'session.workspace.tab-editor': 'Editor',
  'session.workspace.tab-terminal': 'Terminal',
  'session.workspace.popout': 'Mở terminal ra cửa sổ riêng',
  'session.workspace.layout-split': 'Xem editor và terminal song song',
  'session.workspace.layout-tabs': 'Xem theo tab',
  'session.workspace.resize': 'Kéo để đổi cỡ hai khung',

  // ── Cổng của nút Kiểm tra và nút chạy lệnh ───────────────────────────────
  'session.check.blocked-no-session': 'Bấm Bắt đầu để mở phiên rồi mới kiểm tra được.',
  'session.check.blocked-wait': 'Chờ terminal nối xong rồi kiểm tra.',
  'session.check.blocked-expired': 'Phiên đã hết. Mở phiên mới để kiểm tra tiếp.',
  'session.check.blocked-down': 'Terminal đang ngắt. Nối lại rồi kiểm tra.',
  'session.exec.blocked-no-session': 'Chưa có phiên',
  'session.exec.blocked-elsewhere': 'Terminal đang ở cửa sổ riêng',
  'session.exec.blocked-wait': 'Chờ terminal sẵn sàng',
  'session.exec.blocked-down': 'Terminal đang ngắt',

  // ── Khối mã và sơ đồ trong bài ───────────────────────────────────────────
  'session.code.run': 'Chạy',
  'session.code.run-interrupt': 'Ngắt và chạy',
  'session.code.copy': 'Chép',
  'session.code.copied': 'Đã chép',
  'session.code.copy-failed': 'Chép không được',
  'session.code.region': (p: { language: string }) =>
    `Khối mã ${p.language}, cuộn ngang bằng phím mũi tên`,
  'session.code.zoom': 'Phóng to sơ đồ',

  // ── Tuyến các bước của bài học ───────────────────────────────────────────
  // "Tiếp" bị luồng e2e bài học neo bằng `name: 'Tiếp', exact: true`.
  'session.steps.list': 'Các bước của bài',
  'session.steps.prev': 'Trước',
  'session.steps.next': 'Tiếp',
  'session.steps.done': 'Đã đạt',
  'session.steps.current': 'Đang làm',
  'session.steps.todo': 'Chưa làm',

  // ── Dải thông báo ────────────────────────────────────────────────────────
  'session.notice.region': 'Thông báo của phiên',
  'session.notice.dismiss': 'Ẩn thông báo này',
  'session.notice.more': (p: { count: number }) => `Còn ${p.count} thông báo`,
  'session.notice.less': 'Thu gọn',

  // ── Khoang IDE ───────────────────────────────────────────────────────────
  'session.ide.iframe-title': 'Trình soạn thảo trong sandbox',
  'session.ide.no-session': 'Trình soạn thảo mở cùng sandbox. Bấm Bắt đầu để dựng phiên.',
  'session.ide.booting-title': 'Đang dựng trình soạn thảo',
  // 20 giây là số ĐO ĐƯỢC ở P6 (khởi động nguội Theia).
  'session.ide.booting-detail':
    'Lần đầu mở thường mất khoảng 20 giây. Terminal dùng được ngay trong lúc chờ.',
  'session.ide.booting-elapsed': (p: { seconds: number }) => `Đã chờ ${p.seconds} giây`,
  'session.ide.reload': 'Tải lại IDE',
  'session.ide.retry': 'Thử lại',
  'session.ide.open-new-tab': 'Mở trong tab mới',
  'session.ide.reason-http': (p: { status: number }) =>
    `máy chủ trả HTTP ${p.status} cho đường /ide`,
  'session.ide.reason-timeout': (p: { seconds: number }) =>
    `sau ${p.seconds} giây trình soạn thảo vẫn chưa phản hồi`,
  'session.ide.session-down':
    'Phiên đã ngắt nên trình soạn thảo cũng dừng. Mở phiên mới ở thanh trên để làm tiếp.',
  'session.ide.error.probe': (p: { reason: string }) => ({
    what: `Trình soạn thảo chưa mở được: ${p.reason}.`,
    next: 'Bài vẫn làm được bằng terminal, chỉ thiếu trình soạn thảo. Bấm Thử lại, hoặc mở trong tab mới để đọc thông báo thật của máy chủ.',
  }),

  // ── Trình học LAB ────────────────────────────────────────────────────────
  'session.lab.back': 'Lab',
  'session.lab.loading': 'Đang tải lab…',
  'session.lab.tasks-tab': (p: { count: number }) => `Nhiệm vụ (${p.count})`,
  'session.lab.leaderboard-tab': 'Bảng xếp hạng',
  'session.lab.checklist-legend': 'Nhiệm vụ của lab',
  'session.lab.check-one': 'Chấm nhiệm vụ này',
  'session.lab.last-check': 'Lần chấm gần nhất',
  'session.lab.score-label': 'Điểm nếu nộp bây giờ',
  'session.lab.task-weight': (p: { weight: number }) => `${p.weight} điểm`,
  'session.lab.submit': 'Nộp bài',
  'session.lab.submit-note': 'Nộp bài chốt điểm từ các lượt chấm đã có, không chạy lại lượt chấm nào.',
  'session.lab.submit-confirm-title': 'Nộp bài lab này?',
  'session.lab.submit-confirm-body': (p: { percent: number }) =>
    `Điểm được chốt ở ${p.percent}% và lần thử này không chấm lại được nữa.`,
  'session.lab.submit-confirm-unchecked': (p: { count: number }) =>
    `Còn ${p.count} nhiệm vụ chưa chấm lần nào, chúng sẽ tính là chưa đạt.`,
  'session.lab.submit-cancel': 'Làm tiếp',
  'session.lab.duration': (p: { minutes: number; seconds: number }) =>
    `${p.minutes} phút ${p.seconds} giây`,
  'session.lab.duration-line': (p: { duration: string }) => `Thời gian làm bài: ${p.duration}.`,
  'session.lab.duration-unknown': 'Chưa tính được thời gian làm bài cho lần thử này.',
  'session.lab.leaderboard-optin': 'Hiện tên tôi trên bảng xếp hạng. Mặc định là ẩn danh.',
  'session.lab.leaderboard-caption': 'Chỉ hiện tên của người đã tự bật. Còn lại là ẩn danh.',
  'session.lab.leaderboard-loading': 'Đang tải bảng xếp hạng…',
  'session.lab.leaderboard-empty': 'Chưa có ai nộp lab này. Nộp xong, bạn đứng đầu bảng.',
  'session.lab.leaderboard-anonymous': 'Ẩn danh',
  'session.lab.leaderboard-self': ' (bạn)',
  'session.lab.col-rank': '#',
  'session.lab.col-learner': 'Người học',
  'session.lab.col-score': 'Điểm',
  'session.lab.col-time': 'Thời gian',
  'session.lab.unsupported': (p: { capabilities: string }) =>
    `Lab này cần ${p.capabilities}, thứ nền tảng chưa chạy được, nên vài lệnh sẽ báo lỗi. Các nhiệm vụ còn lại vẫn làm được.`,
  'session.lab.reload': 'Tải lại',
  'session.lab.setup-checking': 'Đang kiểm tra môi trường của lab…',
  'session.lab.blocked-no-session': 'Bấm Bắt đầu ở thanh trên để dựng sandbox trước khi chấm.',
  'session.lab.blocked-submitted':
    'Lần thử này đã nộp nên không chấm lại được. Bấm Làm lại để mở lần thử mới.',
  'session.lab.error.open': {
    what: 'Không mở được lab này.',
    next: 'Bấm Tải lại. Nếu vẫn hỏng, quay về danh sách lab rồi mở lại.',
  },
  'session.lab.error.leaderboard': {
    what: 'Không tải được bảng xếp hạng.',
    next: 'Bấm Tải lại. Lab vẫn làm và nộp được bình thường.',
  },
  'session.lab.error.attempt': (p: { reason: string }) => ({
    what: `Không đọc được kết quả lần thử này: ${p.reason}.`,
    next: 'Danh sách nhiệm vụ đang hiện trạng thái cũ. Bấm Tải lại để đọc lại.',
  }),
  'session.lab.error.submit': (p: { reason: string }) => ({
    what: `Không nộp được bài: ${p.reason}.`,
    next: 'Các lượt chấm đã có vẫn được giữ. Bấm Nộp bài lần nữa; nếu phiên đã hết hạn thì bấm Làm lại để mở lần thử mới.',
  }),

  // ── Trạng thái một nhiệm vụ / một lượt chấm ──────────────────────────────
  // `infra` (hỏng hạ tầng) KHÁC `failed` (chưa đạt): một ô "chưa đạt" bảo người
  // học đi sửa bài làm, trong khi thứ hỏng là cụm.
  'session.task.state.not-attempted': 'Chưa chấm',
  'session.task.state.running': 'Đang chấm',
  'session.task.state.passed': 'Đạt',
  'session.task.state.failed': 'Chưa đạt',
  // ⚠ Luồng e2e neo ba chuỗi mở đầu "Đạt", "Chưa đạt (exit ", "Không chấm được".
  'session.task.state.infra': 'Không chấm được',
  'session.task.state.failed-with-exit': (p: { code: number }) => `Chưa đạt (exit ${p.code})`,
  'session.task.infra-note': 'Đây là trục trặc của hệ thống, không phải bài làm của bạn chưa đạt.',
  'session.task.result-title': 'Ghi chú của lệnh chấm',
  'session.task.criteria': 'Tiêu chí',
  'session.task.criterion-ok': 'đạt',
  'session.task.criterion-fail': 'chưa đạt',

  // ── Điểm lab (`score-summary.ts`) ────────────────────────────────────────
  'session.score.weighted-note': (p: { earned: number; total: number }) =>
    ` (${p.earned}/${p.total} điểm trọng số)`,
  'session.score.progress': (p: {
    passed: number;
    total: number;
    percent: number;
    weightNote: string;
  }) =>
    `Đã đạt ${p.passed}/${p.total} nhiệm vụ, nộp bây giờ được ${p.percent}%${p.weightNote}`,
  'session.score.unchecked-warning': (p: { count: number }) =>
    `Còn ${p.count} nhiệm vụ chưa được chấm lần nào. Nếu nộp bây giờ, chúng tính là chưa đạt. Hãy bấm Chấm ở từng nhiệm vụ trước khi nộp.`,
  'session.score.unchecked-note': (p: { count: number }) =>
    `${p.count} nhiệm vụ chưa từng được chấm nên tính là chưa đạt trong điểm trên.`,
  'session.score.verdict': (p: {
    verdict: string;
    percent: number;
    threshold: number;
    weightNote: string;
  }) => `${p.verdict}: ${p.percent}% (mốc ${p.threshold}%)${p.weightNote}`,

  // ── Trình học LESSON ─────────────────────────────────────────────────────
  'session.lesson.back': 'Bài học',
  'session.lesson.loading': 'Đang tải bài học…',
  'session.lesson.not-found': 'Không tìm thấy bài học này.',
  'session.lesson.check': 'Kiểm tra',
  'session.lesson.no-check': 'Bước này không có phần kiểm tra. Làm xong thì bấm Tiếp.',
  'session.lesson.retry': 'Thử lại',
  'session.lesson.phase-intro': 'Giới thiệu',
  'session.lesson.phase-finish': 'Kết thúc',
  'session.lesson.phase-step': (p: { index: number }) => `Bước ${p.index}`,
  'session.lesson.progress-label': 'Tiến độ bài học',
  'session.lesson.progress-done': 'Đã hoàn thành',
  'session.lesson.progress-in-session': (p: { passed: number; total: number }) =>
    `${p.passed}/${p.total} bước đạt trong phiên này`,
  'session.lesson.unsupported': (p: { capabilities: string }) =>
    `Bài này cần ${p.capabilities}, thứ nền tảng chưa chạy được, nên vài lệnh sẽ báo lỗi. Nội dung vẫn đọc được.`,
  'session.lesson.error.setup': (p: { reason: string }) => ({
    what: `Không chuẩn bị được môi trường bài học: ${p.reason}.`,
    next: 'Bấm Thử lại. Nếu vẫn hỏng, kết thúc phiên rồi bấm Bắt đầu để dựng sandbox mới.',
  }),

  // ── Sân chơi ─────────────────────────────────────────────────────────────
  'session.playground.back': 'Sân chơi',
  'session.playground.loading': 'Đang tải sân chơi…',
  'session.playground.unsupported': (p: { capabilities: string }) =>
    `Sân chơi này cần ${p.capabilities}, thứ nền tảng chưa chạy được, nên vài lệnh sẽ báo lỗi.`,
  'session.playground.empty': (p: { minutes: number }) =>
    `Bấm Bắt đầu để dựng sandbox và mở terminal. Phiên tự đóng sau ${p.minutes} phút.`,

  // ── Cửa sổ terminal riêng ────────────────────────────────────────────────
  'session.window.title': (p: { sessionId: string }) => `Terminal, phiên ${p.sessionId}`,
  'session.window.connecting': 'Đang kết nối…',
  'session.window.reconnect': 'Nối lại',
  'session.window.retrying': (p: { seconds: number }) => `Thử nối lại sau ${p.seconds} giây`,
  'session.window.returned': 'Terminal đã về tab bài học. Cửa sổ này có thể đóng.',
  'session.window.take-back': 'Lấy terminal về cửa sổ này',
  'session.window.exited': (p: { code: number }) => `Shell đã thoát (mã ${p.code}).`,
  'session.window.closed': (p: { code: number }) => ({
    what: `Kết nối đã đóng (mã ${p.code}).`,
    next: 'Mỗi phiên chỉ giữ được một kết nối terminal. Nếu tab bài học vừa lấy lại terminal thì cửa sổ này nhường chỗ. Bấm Nối lại để lấy về.',
  }),

  // ── Lỗi dùng chung của ba trình học ──────────────────────────────────────
  'session.error.no-session': {
    what: 'Máy chủ không trả về phiên nào.',
    next: 'Bấm Bắt đầu để thử lại. Nếu vẫn không có phiên, hãy kết thúc một phiên khác bạn đang mở ở trang Của tôi.',
  },
} as const satisfies Surface<'session'>;

/** Nhóm đúng ba khoá anh em, khai tường minh kèm ngày và lý do. Rỗng: không nhóm nào đúng ba. */
export const sessionIntentionalThree = {} as const satisfies IntentionalThree;

/** Khoá đếm, giữ kiểu tường minh để `count()` nhận ra. Chưa có khoá `Counted` nào. */
export type SessionCountedKeys = Extract<(typeof session)[keyof typeof session], Counted>;
