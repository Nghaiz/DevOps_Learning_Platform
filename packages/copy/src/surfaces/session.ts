import type { Counted, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `session.`, sở hữu bởi lane 16.D (L3). Phủ khoang làm việc
 * (`components/session/**`) và ba trình học có terminal: `/labs/<id>`,
 * `/lessons/<id>`, `/playgrounds/<id>`, cộng cửa sổ terminal rời
 * `/session/<id>/terminal`.
 *
 * ⛔ Ký tự U+2014 không xuất hiện ở đâu trong file này, kể cả trong chú thích
 * (luật V3). Mã cũ dùng nó dày đặc, nên phần lớn chuỗi dưới đây đã được viết
 * lại chứ không chép nguyên: chỗ nào cũ dùng gạch ngang dài để nối hai mệnh đề
 * thì nay tách thành hai câu, hoặc dùng dấu phẩy, hoặc dùng dấu hai chấm.
 *
 * ## Ba thứ CỐ Ý không nằm ở đây, nói ra để không ai đi tìm
 *
 * 1. **Nhãn "Còn N chỗ".** Chuỗi đó sinh ở `components/shell/capacity.ts`, file
 *    của lane 16.B, và 16.D không được ghi vào đó. Khiếm khuyết mà hợp đồng
 *    `p16-copy.md` nêu ("lab k8s hiện Còn 0 chỗ") thật ra đã được vá một nửa ở
 *    chính file ấy: nhánh cạn kiệt in `Hết chỗ`, không in `Còn 0 chỗ`. Nửa còn
 *    lại (câu nói ra việc người đọc làm được ngay bây giờ) vẫn thiếu, và nó là
 *    việc của 16.B. Thêm một khoá `session.slots` ở đây mà không có call site
 *    nào là dựng một nghĩa địa, nên không thêm.
 * 2. **Câu "phiên này không nhận được shell bạn chọn".** Nó đến từ
 *    `components/me/preference-notices.ts` (lane 16.H). `shell-fallback.ts` chỉ
 *    quyết định CÓ hiện hay không, không viết câu.
 * 3. **Nhãn độ khó và nhãn tiến độ danh mục.** Chúng thuộc `catalog.`.
 *
 * ## `session.tier.*` nằm ở đây chứ không ở `catalog.`
 *
 * Theo đúng chỉ dẫn của hợp đồng. Kèm NGUYÊN VĂN khối chú thích của
 * `catalog-labels.ts:10-15`, vì đó là một phán quyết biên tập chứ không phải
 * một ghi chú:
 *
 *   Tier giữ NGUYÊN tên kỹ thuật, không dịch và không kèm lời hứa ("nhẹ hơn",
 *   "an toàn hơn"). Ba runtime này khác nhau ở thứ đo được trên hạ tầng cụ thể,
 *   và một tính từ dán ở đây sẽ là một khẳng định mà trang danh mục không có dữ
 *   liệu để bảo vệ.
 *
 * ⚠ Call site hôm nay vẫn là `components/catalog/catalog-labels.ts` (lane
 * 16.C). Ba khoá dưới đây có mặt để 16.C chuyển sang, và lane 16.D đã báo lead.
 */
export const session = {
  // ── Pha phiên (`session-machine.ts`) ──────────────────────────────────────
  //
  // Tám pha, khớp một-một với `SessionPhase`. Bảng tra ở `session-phase.ts`
  // khai `Record<SessionPhase, string>`, nên thiếu một pha là đỏ typecheck chứ
  // không phải một tên pha tiếng Anh lọt ra màn hình người học.
  'session.phase.idle': 'Chưa có phiên',
  'session.phase.creating': 'Đang tạo phiên…',
  'session.phase.connecting': 'Đang kết nối…',
  'session.phase.ready': 'Sandbox sẵn sàng',
  'session.phase.reconnecting': 'Mất kết nối, đang thử lại…',
  'session.phase.exited': 'Shell đã thoát',
  'session.phase.expired': 'Phiên đã kết thúc',
  'session.phase.error': 'Lỗi',

  // ── Hạng sandbox ─────────────────────────────────────────────────────────
  'session.tier.sysbox': 'Sysbox',
  'session.tier.gvisor': 'gVisor',
  'session.tier.kata': 'Kata',

  // ── Sức chứa: nhánh CHƯA BIẾT và nhánh HẾT CHỖ ───────────────────────────
  //
  // Nhánh "biết là bao nhiêu" thuộc 16.B (xem đầu file). Hai nhánh dưới đây
  // sinh ở `components/session/capacity.ts`, file của lane này.
  'session.capacity.unknown-label': 'Chưa rõ sức chứa',
  'session.capacity.unknown-default': (p: { why: string }) =>
    `Chưa đọc được sức chứa nên không nói được còn mấy chỗ. ${p.why} Bạn vẫn bấm Bắt đầu được: nếu hết chỗ thì hệ thống từ chối và báo lại ngay.`,
  'session.capacity.unknown-profile': (p: { why: string }) =>
    `Chưa đọc được sức chứa cho loại bài này nên không nói được còn mấy chỗ. ${p.why} Bạn vẫn bấm Bắt đầu được: nếu hết chỗ thì hệ thống từ chối và báo lại ngay.`,
  'session.capacity.why-quota-unreadable': 'Máy chủ không đọc được hạn mức của cụm.',
  'session.capacity.why-quota-error': (p: { error: string }) =>
    `Máy chủ không đọc được hạn mức của cụm: ${p.error}.`,
  'session.capacity.why-no-profile-cap': 'Máy chủ chưa khai trần cho loại bài này.',
  // Cận dưới, và câu phải không nói dối theo CẢ HAI CHIỀU: "0 chỗ" không chứng
  // minh sẽ bị từ chối, nên nút vẫn bấm được; nhưng im lặng để người ta ăn 429
  // trần trụi cũng sai.
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
    'Đã dùng hết thời lượng tối đa cho phiên này. Hãy kết thúc rồi mở phiên mới.',
  'session.controls.ttl-remaining': (p: { minutes: number }) => `Còn ${p.minutes} phút`,
  'session.controls.ttl-preview': (p: { minutes: number }) => `Phiên kéo dài ${p.minutes} phút`,

  // ── Khoang terminal ──────────────────────────────────────────────────────
  'session.terminal.title': 'Terminal',
  // Nhãn a11y nêu luôn đường thoát: `role="application"` tắt chế độ duyệt của
  // trình đọc màn hình, nên câu đầu tiên người dùng nghe phải nói được cách ra.
  'session.terminal.aria-label': 'Terminal sandbox. Nhấn Esc hai lần để rời khỏi terminal.',
  'session.terminal.aria-label-window':
    'Terminal sandbox toàn màn hình. Nhấn Esc hai lần để rời khỏi terminal.',
  'session.terminal.booting': 'Đang mở terminal…',
  'session.terminal.empty': 'Bấm Bắt đầu để dựng sandbox và mở terminal.',
  'session.terminal.escape-hint-prefix': 'Nhấn',
  'session.terminal.escape-hint-suffix': 'để rời khỏi terminal',

  // ── Khoang làm việc (tab Editor + Terminal) ──────────────────────────────
  'session.workspace.tablist': 'Khoang làm việc',
  'session.workspace.tab-editor': 'Editor',
  'session.workspace.tab-terminal': 'Terminal',
  'session.workspace.popout-title': 'Mở tab này ra một cửa sổ riêng',
  'session.workspace.popout-sr': 'Mở tab này ra cửa sổ riêng',
  'session.workspace.separator': 'Kéo để đổi chiều cao khoang terminal',

  /*
    ⚠ KHÔNG có khoá `session.topbar.*`, và đó là một quyết định chứ không phải
    một chỗ bỏ sót.

    16.D.1 có hai nửa. Nửa immersive đã xong (`immersive-routes.ts`), nên thanh
    56px của vỏ không còn ăn chiều cao của trang lab nữa. Nửa còn lại của thiết
    kế là đổi thanh tiến độ thẳng sang CUNG ellipse, và nửa đó CHƯA làm: cơ chế
    chạy của cung (`stroke-dashoffset: calc(1 - var(--p))` trên một custom
    property chưa đăng ký) nằm trong danh sách "chưa ai đo trên trình duyệt
    thật" của `phase-16.md` §16.I.5.

    Đổi một `ProgressBar` đang chạy đúng và có `role="progressbar"` lấy một cơ
    chế chưa đo, trong đúng cái lane mà kỷ luật là "đừng giao thứ chưa đo", là
    một cuộc đổi sai chiều. Chờ 16.I đo xong.

    Nên ở đây không có khoá nào: một khoá không có call site là một nghĩa địa,
    và file này đã từ chối `session.slots` vì đúng lý do đó.
  */

  // ── Khoang IDE ───────────────────────────────────────────────────────────
  'session.ide.pane-title': 'Trình soạn thảo',
  'session.ide.iframe-title': 'Trình soạn thảo trong sandbox',
  'session.ide.no-session': 'Trình soạn thảo mở cùng sandbox. Bấm Bắt đầu để dựng phiên.',
  'session.ide.booting-status': 'IDE đang khởi động…',
  'session.ide.booting-title': 'Đang dựng trình soạn thảo',
  // Con số 20 giây là số ĐO ĐƯỢC ở P6 (khởi động nguội Theia), không phải một
  // ước lượng lịch sự. Nói ra nó là cách duy nhất hai mươi giây chờ đọc ra là
  // chờ chứ không phải trang hỏng.
  'session.ide.booting-detail':
    'Lần đầu mở thường mất khoảng 20 giây. Terminal bên cạnh dùng được ngay trong lúc chờ.',
  'session.ide.booting-elapsed': (p: { seconds: number }) => `Đã chờ ${p.seconds} giây`,
  'session.ide.reload': 'Tải lại IDE',
  'session.ide.retry': 'Thử lại',
  'session.ide.open-new-tab': 'Mở trong tab mới',
  'session.ide.open-new-tab-error': 'Mở trong tab mới để xem lỗi máy chủ',
  'session.ide.reason-http': (p: { status: number }) =>
    `máy chủ trả HTTP ${p.status} cho đường /ide`,
  'session.ide.reason-timeout': (p: { seconds: number }) =>
    `sau ${p.seconds} giây trình soạn thảo vẫn chưa phản hồi`,
  // Hai nửa TÁCH RỜI ở tầng kiểu. Câu `next` là thứ biến một ngõ cụt thành một
  // đường đi: người học không mất bài, họ mất trình soạn thảo.
  'session.ide.error.probe': (p: { reason: string }) => ({
    what: `Trình soạn thảo chưa mở được: ${p.reason}.`,
    next: 'Bài vẫn làm được bình thường bằng terminal, chỉ thiếu trình soạn thảo. Bấm Thử lại, hoặc mở trong tab mới để đọc thông báo thật của máy chủ.',
  }),

  // ── Trình học LAB ────────────────────────────────────────────────────────
  'session.lab.back': 'Về danh sách lab',
  'session.lab.loading': 'Đang tải lab…',
  'session.lab.tasks-tab': (p: { count: number }) => `Nhiệm vụ (${p.count})`,
  'session.lab.leaderboard-tab': 'Bảng xếp hạng',
  'session.lab.checklist-caption': 'Bấm một nhiệm vụ để đọc đề và chấm riêng nhiệm vụ đó.',
  'session.lab.checklist-legend': 'Nhiệm vụ của lab',
  'session.lab.check-one': 'Chấm nhiệm vụ này',
  'session.lab.hint': 'Gợi ý',
  'session.lab.last-exit': (p: { code: number }) =>
    `Lần chấm gần nhất kết thúc với exit ${p.code}.`,
  'session.lab.submit': 'Nộp bài',
  'session.lab.submit-note':
    'Nộp bài chốt điểm từ các lượt chấm đã có. Nó KHÔNG chạy lại lượt chấm nào.',
  'session.lab.duration': (p: { minutes: number; seconds: number }) =>
    `${p.minutes} phút ${p.seconds} giây`,
  'session.lab.duration-line': (p: { duration: string }) => `Thời gian làm bài: ${p.duration}.`,
  'session.lab.duration-unknown': 'Chưa tính được thời gian làm bài cho lần thử này.',
  'session.lab.leaderboard-optin': 'Hiện tên tôi trên bảng xếp hạng (mặc định ẨN DANH)',
  'session.lab.leaderboard-caption': 'Chỉ hiện tên của người đã tự bật. Mặc định là ẩn danh.',
  'session.lab.leaderboard-loading': 'Đang tải bảng xếp hạng…',
  'session.lab.leaderboard-empty':
    'Chưa có ai nộp bài lab này. Nộp bài xong, bạn sẽ là người đầu tiên trên bảng.',
  'session.lab.leaderboard-anonymous': 'Ẩn danh',
  'session.lab.leaderboard-self': ' (bạn)',
  'session.lab.col-rank': '#',
  'session.lab.col-learner': 'Người học',
  'session.lab.col-score': 'Điểm',
  'session.lab.col-time': 'Thời gian',
  'session.lab.col-task': 'Nhiệm vụ',
  'session.lab.col-weight': 'Trọng số',
  'session.lab.col-state': 'Trạng thái',
  'session.lab.unsupported': (p: { capabilities: string }) =>
    `Lab này cần ${p.capabilities}. Nền tảng chưa chạy được những năng lực đó, nên một số lệnh trong lab sẽ báo lỗi. Bạn vẫn mở được để đọc nội dung và làm các nhiệm vụ còn lại.`,
  'session.lab.reload': 'Tải lại',
  'session.lab.setup-checking': 'Đang kiểm tra môi trường của bài…',
  'session.lab.blocked-no-session': 'Hãy bấm Bắt đầu ở trên để dựng sandbox trước khi chấm.',
  'session.lab.blocked-submitted':
    'Lần thử này đã nộp nên không chấm lại được. Bấm Bắt đầu để mở lần thử mới.',
  'session.lab.error.open': {
    what: 'Không mở được lab này.',
    next: 'Bấm Tải lại. Nếu vẫn hỏng, quay về danh sách lab rồi mở lại.',
  },
  'session.lab.error.leaderboard': {
    what: 'Không tải được bảng xếp hạng.',
    next: 'Bấm Tải lại. Bài lab vẫn làm và nộp được bình thường.',
  },
  'session.lab.error.attempt': (p: { reason: string }) => ({
    what: `Không đọc được kết quả lần thử này: ${p.reason}.`,
    next: 'Danh sách nhiệm vụ bên dưới đang hiện trạng thái cũ. Bấm Tải lại để đọc lại.',
  }),
  // Bản trước hiện thẳng chuỗi thô của `describeTrpcError` cạnh nút Nộp bài:
  // một nửa câu trả lời, không có nửa "giờ làm gì". Luật V4 ép hai nửa ở tầng
  // kiểu, nên nó không quay lại được.
  'session.lab.error.submit': (p: { reason: string }) => ({
    what: `Không nộp được bài: ${p.reason}.`,
    next: 'Các lượt chấm đã có vẫn được giữ. Bấm Nộp bài lần nữa; nếu phiên đã hết hạn thì bấm Bắt đầu để mở lần thử mới.',
  }),

  // ── Trạng thái một nhiệm vụ ──────────────────────────────────────────────
  //
  // ⛔ BỐN trạng thái, không phải ba. `infra` (hỏng hạ tầng) KHÁC HẲN `failed`
  // (chưa đạt), và tầng dữ liệu đã phân biệt đúng từ trước: `lab-client.tsx`
  // tách nhánh `kind:'error'` khỏi `passed:false`. Thứ thiếu là phần NHÌN.
  //
  // Vì sao nó quan trọng đủ để thành bốn khoá: một ô "chưa đạt" bảo người học
  // đi sửa bài làm của mình, trong khi thứ hỏng là cụm. Họ sẽ sửa một thứ không
  // sai, rất lâu.
  'session.task.state.not-attempted': 'Chưa chấm',
  'session.task.state.running': 'Đang chấm',
  'session.task.state.passed': 'Đạt',
  'session.task.state.failed': 'Chưa đạt',
  // ⚠ Chuỗi này bị `e2e/flows/lesson.flow.spec.ts` neo bằng regex `^(...)`. Nó
  // phải là "Không chấm được", không phải "Chưa chấm được": hai câu đọc gần
  // giống nhau nhưng chỉ một câu làm luồng e2e xanh, và luồng đó đỏ vì một lý
  // do ĐÚNG (một trong ba nhánh đã biến mất khỏi màn hình).
  'session.task.state.infra': 'Không chấm được',
  // Cùng nhóm `state` vì nó LÀ một nhãn trạng thái, chỉ là bản có thêm mã thoát.
  // Để nó ở `session.task.*` sẽ đẩy nhóm đó thành đúng ba khoá anh em, và T3
  // đúng khi bắt: nhóm ấy không phải một bộ ba có chủ ý, nó chỉ tình cờ ba.
  'session.task.state.failed-with-exit': (p: { code: number }) => `Chưa đạt (exit ${p.code})`,
  'session.task.infra-note':
    'Đây là trục trặc của hệ thống, không phải bài làm của bạn chưa đạt.',
  'session.task.result-title': 'Kết quả lệnh chấm',

  // ── Điểm lab ─────────────────────────────────────────────────────────────
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
  'session.lesson.back': 'Về danh sách bài học',
  'session.lesson.loading': 'Đang tải bài học…',
  'session.lesson.not-found': 'Không tìm thấy bài học này.',
  'session.lesson.check': 'Kiểm tra',
  'session.lesson.check-blocked': 'Hãy bắt đầu phiên trước',
  'session.lesson.retry': 'Thử lại',
  'session.lesson.phase-intro': 'Giới thiệu',
  'session.lesson.phase-finish': 'Kết thúc',
  'session.lesson.phase-step': (p: { index: number }) => `Bước ${p.index}`,
  'session.lesson.progress-done': 'Đã hoàn thành',
  'session.lesson.progress-in-session': (p: { passed: number; total: number }) =>
    `${p.passed}/${p.total} bước đã đạt trong phiên này`,
  'session.lesson.unsupported': (p: { capabilities: string }) =>
    `Bài này cần ${p.capabilities}. Nền tảng chưa chạy được những năng lực đó, nên một số lệnh trong bài sẽ báo lỗi. Bạn vẫn mở được để đọc nội dung.`,
  'session.lesson.error.setup': (p: { reason: string }) => ({
    what: `Không chuẩn bị được môi trường bài học: ${p.reason}.`,
    next: 'Bấm Thử lại. Nếu vẫn hỏng, kết thúc phiên rồi bấm Bắt đầu để dựng một sandbox mới.',
  }),

  // ── Sân chơi ─────────────────────────────────────────────────────────────
  'session.playground.back': 'Về danh sách sân chơi',
  'session.playground.loading': 'Đang tải sân chơi…',
  'session.playground.unsupported': (p: { capabilities: string }) =>
    `Sân chơi này cần ${p.capabilities}. Nền tảng chưa chạy được những năng lực đó, nên một số lệnh sẽ báo lỗi.`,
  'session.playground.empty': (p: { minutes: number }) =>
    `Bấm Bắt đầu để dựng sandbox và mở terminal. Phiên tự đóng sau ${p.minutes} phút.`,

  // ── Cửa sổ terminal rời ──────────────────────────────────────────────────
  'session.window.title': (p: { sessionId: string }) => `Terminal, phiên ${p.sessionId}`,
  'session.window.connecting': 'Đang kết nối…',
  'session.window.reconnect': 'Thử nối lại',
  'session.window.exited': (p: { code: number }) => `Shell đã thoát (mã ${p.code}).`,
  // Một kết nối cho mỗi phiên là ràng buộc của gateway, không phải một trục
  // trặc. Người dùng cần biết chính họ vừa lấy mất chỗ của cửa sổ này.
  'session.window.closed': (p: { code: number }) => ({
    what: `Kết nối đã đóng (mã ${p.code}).`,
    next: 'Mỗi phiên chỉ giữ được MỘT kết nối terminal, nên nếu bạn vừa mở lại terminal ở tab bài học thì cửa sổ này đã bị thay chỗ. Bấm Thử nối lại để lấy lại kết nối.',
  }),

  // ── Lỗi dùng chung của ba trình học ──────────────────────────────────────
  'session.error.no-session': {
    what: 'Máy chủ không trả về phiên nào.',
    next: 'Bấm Bắt đầu để thử lại. Nếu vẫn không có phiên, hãy kết thúc một phiên khác bạn đang mở ở trang Của tôi.',
  },
} as const satisfies Surface<'session'>;

/**
 * Nhóm đúng ba khoá anh em, khai tường minh kèm ngày và lý do.
 *
 * Dòng `session.tier` là dòng hợp đồng `p16-copy.md` §3.3 đã viết sẵn.
 */
export const sessionIntentionalThree = {
  'session.tier':
    '2026-09-10: đúng ba runtime sandbox tồn tại (sysbox, gvisor, kata), khớp SandboxTierName.',
} as const satisfies IntentionalThree;

/**
 * Khoá đếm, giữ kiểu tường minh để `count()` nhận ra.
 *
 * Chưa có khoá `Counted` nào trong surface này, và đó là một quyết định chứ
 * không phải một chỗ bỏ sót: khoá đếm duy nhất mà hợp đồng nêu tên
 * (`session.slots`) có call site nằm ở `components/shell/capacity.ts`, file của
 * lane 16.B. Xem khối đầu file.
 */
export type SessionCountedKeys = Extract<(typeof session)[keyof typeof session], Counted>;
