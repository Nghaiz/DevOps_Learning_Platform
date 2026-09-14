import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `me.`, sở hữu bởi lane 16.H (L7). Phủ hai màn: `/me` và `/settings`.
 *
 * ⛔ LUẬT GÕ PHÍM CỦA CẢ GÓI: không U+2014, U+2013, U+2015 ở bất kỳ đâu, kể cả
 * chú thích. Bảy chuỗi cũ mang U+2014 đã được viết lại bằng cách TÁCH CÂU chứ
 * không thay bằng một ký tự trông giống: hai `metadata.title`, ba câu ghi chú
 * tuỳ chọn ở `preference-notices.ts`, một câu lỗi ở `session-summary.ts`, và
 * một câu ở `path-progress.ts`.
 *
 * ## Bộ chọn của lane trả về CÂU, theo tiền lệ 16.F chứ không 16.C
 *
 * Chín module thuần trong `components/me/` gọi `t()` ngay trong thân hàm và vẫn
 * trả `string`. Lý lẽ giống hệt 16.F: thứ §1.6 chống là hàm GHÉP CÂU tại chỗ,
 * vì lúc đó bộ dò chỉ soi được nhánh mà probe đi vào. Ở đây mọi nhánh của mọi
 * bộ chọn là một khoá trong bản đồ này, nên phủ của bộ dò là 100% ở cả hai
 * cách, còn `CopyRef` thì ĐÁNH RƠI phép kiểm tham số ở tầng biên dịch.
 *
 * Lane này có thêm một lý do mà 16.F không có: chín module đó là hàm thuần ĐÃ
 * CÓ TEST, và brief cấm xoá test. Giữ kiểu trả `string` nghĩa là các khẳng định
 * cũ chuyển sang câu mới chứ không phải chuyển sang một hình dạng dữ liệu mới.
 *
 * ## Nhãn thao tác lặp KHÔNG khai lại ở đây
 *
 * `Lưu`, `Huỷ`, `Xoá`, `Thử lại` đã có ở `common.action.*`. Chỉ nhãn nào mang
 * TÂN NGỮ riêng của màn này (`Lưu tên`, `Lưu tuỳ chọn`, `Đổi mật khẩu`) mới
 * sống dưới tiền tố `me.`, vì chúng không phải bản sao của nút chung.
 *
 * ## Thời lượng đi qua `unit.*` của L0
 *
 * `formatDuration` gọi `unit.second` / `unit.minute` thay vì khai lại `N giây`
 * dưới tiền tố `me.`. Chỉ dạng ghép `N giờ M phút` ở lại đây, vì `common.` chưa
 * có nó và một khoá chỉ dùng ở đúng một surface thuộc về surface đó (§1.7).
 */
export const me = {
  // ── Hai màn: tiêu đề tài liệu, tiêu đề trang, câu dẫn ─────────────────────
  /*
    `metadata.title` vào bản đồ theo §1.7 ("`<title>` và meta description").
    Dấu phân cách là dấu chấm giữa, không phải gạch ngang dài: mười `page.tsx`
    khác trong ứng dụng vẫn dùng gạch ngang dài, nhưng chúng nằm ngoài glob
    của lane này.
  */
  'me.page.me-document-title': 'Của tôi · DevOps Learning Platform',
  'me.page.me-title': 'Của tôi',
  'me.page.me-subtitle': 'Lộ trình đang dở, phiên đang mở, và lịch sử học của bạn.',
  'me.page.me-settings-link': 'Cài đặt',
  'me.page.settings-document-title': 'Hồ sơ và cài đặt · DevOps Learning Platform',
  'me.page.settings-title': 'Hồ sơ và cài đặt',
  'me.page.settings-subtitle': 'Tên hiển thị, mật khẩu, và tuỳ chọn cho phiên sandbox của bạn.',
  'me.page.settings-back': 'Về trang Của tôi',

  // ── `/me` · lộ trình đang dở ──────────────────────────────────────────────
  'me.learning.title': 'Lộ trình đang dở',
  'me.learning.empty-title': 'Chưa có lộ trình nào đang dở',
  'me.learning.empty-description':
    'Mục này chỉ hiện lộ trình bạn đã đạt ít nhất một phần và chưa đạt hết.',
  'me.learning.empty-action': 'Xem lộ trình',

  // ── Nhãn tiến độ lộ trình (`path-progress.ts`) ────────────────────────────
  'me.path.no-items': 'Lộ trình chưa có phần nào',
  'me.path.passed': (p: { passed: number; total: number }) =>
    `Đã đạt ${String(p.passed)}/${String(p.total)} phần`,
  'me.path.next-item': (p: { id: string }) => `Phần tiếp theo: ${p.id}`,
  'me.path.all-passed': 'Đã đạt tất cả các phần',
  /*
    Câu cũ nối hai vế bằng một gạch ngang dài. Tách thành hai câu: vế sau là
    một chỉ dẫn hành động, nên nó xứng đáng một câu riêng.
  */
  'me.path.locked': 'Không còn phần nào đang mở. Đạt phần trước đó để mở khoá.',

  // ── `/me` · phiên đang mở ─────────────────────────────────────────────────
  'me.sessions.title': 'Phiên đang mở',
  'me.sessions.empty-title': 'Bạn không có phiên nào đang mở',
  'me.sessions.empty-description':
    'Phiên được tạo khi bạn bắt đầu một bài học, lab hoặc playground, và tự hết hạn khi tới giờ.',
  'me.sessions.end': 'Kết thúc',
  'me.sessions.col.id': 'Phiên',
  'me.sessions.col.status': 'Trạng thái',
  'me.sessions.col.opened': 'Mở lúc',
  'me.sessions.col.expires': 'Hạn',
  'me.sessions.col.actions': 'Hành động',
  'me.sessions.confirm-title': (p: { id: string }) => `Kết thúc phiên ${p.id}?`,
  'me.sessions.confirm-description':
    'Máy sandbox bị thu hồi ngay và mọi thứ chưa lưu trong đó sẽ mất. Chỗ này được trả lại cho lớp, và bạn mở phiên mới bất cứ lúc nào.',
  'me.sessions.confirm-keep': 'Để nguyên',
  'me.sessions.confirm-end': 'Kết thúc phiên',

  // ── Sức chứa: `null` là CHƯA BIẾT, không phải "đã đầy" ────────────────────
  'me.capacity.unknown': 'Chưa rõ sức chứa',
  'me.capacity.unknown-detail':
    'Máy chủ chưa đọc được hạn mức của cụm, nên không nói được còn mấy chỗ.',

  // ── Trạng thái phiên, giọng NGƯỜI HỌC (`session-summary.ts`) ──────────────
  /*
    Tám mã của `SessionStatus`, và hai mã cùng đọc ra "Đang chuẩn bị máy" nên
    chỉ có bảy khoá. `session-summary.test.ts` đối chiếu bảng số với enum sinh
    từ proto: thêm một trạng thái mới ở orchestrator mà quên dịch là ĐỎ.
  */
  'me.session-status.unknown': 'Chưa rõ trạng thái',
  'me.session-status.preparing': 'Đang chuẩn bị máy',
  'me.session-status.ready': 'Máy đã sẵn sàng',
  'me.session-status.running': 'Đang chạy',
  'me.session-status.expired': 'Đã hết hạn',
  'me.session-status.ended': 'Đã kết thúc',
  'me.session-status.failed': 'Phiên gặp lỗi',
  'me.session-status.strange': (p: { status: number }) => `Trạng thái lạ (${String(p.status)})`,

  'me.expiry.unknown': 'không rõ hạn',
  'me.expiry.remaining': (p: { minutes: number }) => `còn ${String(p.minutes)} phút`,
  'me.expiry.now': 'hết hạn ngay bây giờ',
  'me.expiry.overdue': 'đã quá hạn, đang được dọn',

  // ── `/me` · lịch sử học ───────────────────────────────────────────────────
  'me.history.title': 'Lịch sử học',
  'me.history.tab.lessons': 'Bài học',
  'me.history.tab.labs': 'Lab',
  'me.history.tab.quizzes': 'Quiz',

  /*
    Một trang RỖNG có ba nguyên nhân và giao diện cũ chỉ biết một. Câu được ghép
    từ hai vế theo thứ tự cố định: CHUYỆN GÌ XẢY RA, rồi LÀM GÌ TIẾP. Thiếu vế
    đầu thì người dùng tưởng mất dữ liệu; thiếu vế sau thì họ vẫn kẹt.
  */
  'me.history.empty-page-title': 'Trang này không có mục nào',
  'me.history.empty-page-title-skipped': 'Trang này không hiển thị được mục nào',
  'me.history.empty-page-removed': (p: { n: number }) =>
    `${String(p.n)} mục ở trang này thuộc nội dung đã bị gỡ khỏi hệ thống. `,
  'me.history.empty-page-go-next': 'Bấm "Trang sau" để xem phần còn lại của lịch sử.',
  'me.history.empty-page-go-first': 'Bấm "Về trang đầu" để xem lại từ đầu.',
  'me.history.empty-page-nothing-else': 'Không còn mục nào khác để xem.',

  // ── Tab bài học ───────────────────────────────────────────────────────────
  'me.lessons.blank-title': 'Chưa có bài học nào',
  'me.lessons.blank-description': 'Mở một bài học và tiến độ của bạn sẽ hiện ở đây.',
  'me.lessons.col.lesson': 'Bài học',
  'me.lessons.col.status': 'Trạng thái',
  'me.lessons.col.updated': 'Cập nhật',
  'me.lessons.status-done': 'Đã xong',
  'me.lessons.status-learning': 'Đang học',
  /*
    "Đang ở bước N" là một VỊ TRÍ, không phải số bước đã xong: `lessons.setStep`
    ghi thẳng vị trí hiện tại, nên người học nhảy về bước 1 để đọc lại thì cột
    này thành 0. Câu "đã xong N bước" đúng là hình dạng đã đẻ ra nợ P2.
  */
  'me.lessons.step': (p: { step: number }) => `Đang ở bước ${String(p.step)}`,

  // ── Tab lab ───────────────────────────────────────────────────────────────
  'me.labs.blank-title': 'Chưa có lần thử lab nào',
  'me.labs.blank-description': 'Bắt đầu một lab và mọi lần thử của bạn sẽ được ghi lại ở đây.',
  'me.labs.col.lab': 'Lab',
  'me.labs.col.result': 'Kết quả',
  'me.labs.col.score': 'Điểm',
  'me.labs.col.duration': 'Thời lượng',
  'me.labs.col.started': 'Bắt đầu',
  'me.labs.status.in-progress': 'Đang làm dở',
  'me.labs.status.passed': 'Đạt',
  'me.labs.status.failed': 'Chưa đạt',
  /*
    `computeLabStatus` trả `in_progress` khi chưa nộp, nhưng `computeLabScore`
    VẪN tính `percent` từ những nhiệm vụ đã chấm. Hiện "40%" trần trụi cạnh một
    lần thử đang dở đọc như một điểm đã chốt, trong khi nó là ảnh chụp giữa
    chừng và sẽ còn lên. Nhãn phải nói ra phạm vi đó.
  */
  'me.labs.score-partial': (p: { percent: number }) =>
    `${String(p.percent)}% tính tới lúc này (chưa nộp)`,
  'me.labs.score-final': (p: { percent: number; tasks: number }) =>
    `${String(p.percent)}% · đạt ${String(p.tasks)} nhiệm vụ`,
  /*
    `null` = chưa nộp, nên KHÔNG có thời lượng. Hiện "0 giây" cho một lần thử
    đang mở là bịa ra một con số mà máy chủ cố ý từ chối trả.
  */
  'me.duration.unsubmitted': 'chưa nộp',
  'me.duration.hours': (p: { hours: number; minutes: number }) =>
    `${String(p.hours)} giờ ${String(p.minutes)} phút`,

  // ── Tab quiz ──────────────────────────────────────────────────────────────
  'me.quizzes.blank-title': 'Chưa có lượt làm quiz nào',
  'me.quizzes.blank-description': 'Làm một quiz và kết quả từng lượt sẽ hiện ở đây.',
  'me.quizzes.col.quiz': 'Quiz',
  'me.quizzes.col.result': 'Kết quả',
  'me.quizzes.col.score': 'Điểm',
  'me.quizzes.col.submitted': 'Nộp lúc',
  'me.quizzes.status-passed': 'Đạt',
  'me.quizzes.status-failed': 'Chưa đạt',
  'me.quizzes.score': (p: { correct: number; total: number; percent: number }) =>
    `${String(p.correct)}/${String(p.total)} câu đúng · ${String(p.percent)}%`,

  // ── `/settings` · hồ sơ ───────────────────────────────────────────────────
  'me.profile.title': 'Hồ sơ',
  'me.profile.description': 'Tên này hiện trên bảng xếp hạng khi bạn cho phép.',
  'me.profile.name-label': 'Tên hiển thị',
  'me.profile.name-empty': 'Tên không được để trống. Nhập ít nhất một ký tự.',
  'me.profile.email-label': 'Email',
  'me.profile.role-label': 'Vai trò',
  'me.profile.saved': 'Đã lưu tên hiển thị.',
  'me.profile.save': 'Lưu tên',

  /*
    Ba vai trò của cột `users.role`. `me.get` trả mã thô, và một mã lạ KHÔNG
    được đọc ra "Người học": nó hiện nguyên mã, để người dùng báo lại được thứ
    họ nhìn thấy.
  */
  'me.role.user': 'Người học',
  'me.role.author': 'Tác giả nội dung',
  'me.role.admin': 'Quản trị viên',

  // ── `/settings` · mật khẩu ────────────────────────────────────────────────
  'me.password.title': 'Mật khẩu',
  'me.password.description': (p: { min: number }) =>
    `Cần mật khẩu hiện tại để xác nhận. Mật khẩu mới tối thiểu ${String(p.min)} ký tự.`,
  'me.password.hidden-title': 'Không có mật khẩu để đổi',
  /*
    `hasPassword: false` nghĩa là tài khoản CHƯA BAO GIỜ có mật khẩu. Ẩn form mà
    không nói gì thì người dùng đi tìm chỗ đổi mật khẩu và thấy trang trống, nên
    câu này là phần bắt buộc của quyết định ẩn, không phải phần trang trí.
  */
  'me.password.hidden-reason':
    'Tài khoản này đăng nhập bằng Google hoặc Microsoft nên không có mật khẩu ở đây để đổi. Đổi mật khẩu tại chính nhà cung cấp đó.',
  'me.password.field.current': 'Mật khẩu hiện tại',
  'me.password.field.next': 'Mật khẩu mới',
  'me.password.field.confirm': 'Nhập lại mật khẩu mới',
  'me.password.submit': 'Đổi mật khẩu',
  'me.password.done': 'Đã đổi mật khẩu. Các phiên đăng nhập khác của bạn vẫn giữ nguyên.',

  // ── `/settings` · tuỳ chọn ────────────────────────────────────────────────
  'me.preferences.title': 'Tuỳ chọn',
  'me.preferences.dirty': 'Chưa lưu',
  'me.preferences.description':
    'Áp dụng cho phiên và terminal bạn mở sau khi lưu, không đổi thứ đang chạy.',
  'me.preferences.shell-label': 'Shell mặc định',
  'me.preferences.theme-label': 'Màu terminal',
  'me.preferences.theme-follow': 'Theo giao diện trang',
  'me.preferences.leaderboard-label': 'Hiện tên tôi trên bảng xếp hạng',
  'me.preferences.save': 'Lưu tuỳ chọn',
  'me.preferences.saved': 'Đã lưu tuỳ chọn.',

  'me.shell.bash': 'bash',
  'me.shell.zsh': 'zsh',
  'me.shell.pwsh': 'PowerShell (pwsh)',

  'me.terminal-theme.dlp-dark': 'Tối',
  'me.terminal-theme.dlp-light': 'Sáng',
  'me.terminal-theme.dlp-contrast': 'Tương phản cao',

  // ── Ghi chú hệ quả của từng tuỳ chọn ──────────────────────────────────────
  /*
    Ba tuỳ chọn đều có cùng một hình dạng nguy hiểm: người dùng bấm lưu, thấy
    "Đã lưu", và tin rằng thứ họ vừa chọn ĐANG có hiệu lực. Với cả ba, điều đó
    sai theo một kiểu riêng, và không kiểu nào lộ ra nếu giao diện chỉ nói
    "Đã lưu".
  */
  'me.notice.shell-next-session': (p: { fallback: string }) =>
    `Shell được ghi vào máy ở lần mở phiên TIẾP THEO, không phải ngay bây giờ. Nếu lúc đó máy chưa kịp được cấp, lần mở đó bỏ qua tuỳ chọn và bạn nhận ${p.fallback} mặc định của máy. Mở lại phiên là áp được.`,
  'me.notice.shell-active-sessions': (p: { howMany: string }) =>
    `Bạn đang có ${p.howMany} phiên chạy. Chúng giữ shell cũ cho tới khi kết thúc. Kết thúc phiên ở trang "Của tôi" rồi mở lại nếu muốn dùng ngay.`,
  /*
    `nextCursor !== null` nghĩa là con số đếm được là SÀN chứ không phải tổng.
    Nói "2 phiên" khi thật ra có 7 là một câu sai ở đúng ca cảnh báo này quan
    trọng nhất; nói "ít nhất 2" thì không.
  */
  'me.notice.shell-at-least': (p: { n: number }) => `ít nhất ${String(p.n)}`,
  'me.notice.session-fallback': (p: { fallback: string; chosen: string }) =>
    `Phiên này đang chạy ${p.fallback} mặc định của máy, không phải ${p.chosen} bạn đã chọn.`,
  'me.notice.leaderboard-public': 'Những lần thử lab SAU sẽ hiện tên bạn trên bảng xếp hạng.',
  'me.notice.leaderboard-private': 'Những lần thử lab SAU sẽ ẩn danh trên bảng xếp hạng.',
  'me.notice.leaderboard-scope':
    'Các lần thử đã nộp giữ lựa chọn của riêng chúng. Đổi từng lần ở trang lab đó.',
  'me.notice.terminal-follow': 'Terminal đổi màu theo giao diện sáng/tối của trang.',
  'me.notice.terminal-pinned': (p: { theme: string }) =>
    `Terminal luôn dùng bảng màu "${p.theme}", kể cả khi bạn đổi giao diện trang.`,
  'me.notice.terminal-scope': 'Áp dụng cho terminal bạn mở sau khi lưu.',

  // ── Lỗi: hai nửa TÁCH RỜI ở tầng kiểu ─────────────────────────────────────
  /*
    ⚠ Mọi mục dưới đây nội suy `reason`/`message` vào MỘT chuỗi có tiền tố, chưa
    bao giờ gán thẳng `what: p.message`. Bộ dò `renderMessages` gọi hàm với một
    số làm probe TRƯỚC; một `what` nhận thẳng số `7` làm `typeof what === 'string'`
    sai, `renderEntry` trả `null`, và mục đó trượt khỏi MỌI cổng giá trị trong
    im lặng. Ba mục của 16.F đã dính đúng bẫy này.
  */
  'me.error.profile-load': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được hồ sơ: ${p.reason}`,
    next: 'Bấm Thử lại. Nếu vẫn lỗi, đăng xuất rồi đăng nhập lại.',
  }),
  'me.error.paths-load': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được lộ trình đang dở: ${p.reason}`,
    next: 'Bấm Thử lại. Phần còn lại của trang vẫn dùng được.',
  }),
  'me.error.sessions-load': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được danh sách phiên: ${p.reason}`,
    next: 'Bấm Thử lại. Phiên đang chạy không bị ảnh hưởng bởi lỗi đọc này.',
  }),
  'me.error.history-load': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được lịch sử: ${p.reason}`,
    next: 'Bấm Thử lại. Nếu lỗi nói về cursor thì về trang đầu, vì cursor cũ có thể đã hết hiệu lực.',
  }),
  /*
    `NOT_FOUND` là một phán quyết có nghĩa: phiên đã tự hết hạn. Mọi mã khác có
    thể là mạng chập hay lỗi thật, nên KHÔNG được nói chắc phiên còn hay mất.
  */
  'me.error.session-end-missing': (p: { message: string }): ErrorEntry => ({
    what: `${p.message}.`,
    next: 'Tải lại danh sách. Phiên có thể đã tự hết hạn trước khi bạn bấm.',
  }),
  'me.error.session-end': (p: { message: string }): ErrorEntry => ({
    what: `Không kết thúc được phiên: ${p.message}`,
    next: 'Tải lại danh sách rồi thử lại. Nếu vẫn hỏng thì phiên sẽ tự hết hạn khi tới giờ.',
  }),
  'me.error.profile-save': (p: { reason: string }): ErrorEntry => ({
    what: `Không lưu được tên hiển thị: ${p.reason}`,
    next: 'Sửa lại tên rồi lưu. Nếu vẫn hỏng thì tải lại trang.',
  }),
  'me.error.preferences-save': (p: { reason: string }): ErrorEntry => ({
    what: `Không lưu được tuỳ chọn: ${p.reason}`,
    next: 'Thử lưu lại. Nếu vẫn hỏng thì tải lại trang để xem tuỳ chọn hiện tại của bạn.',
  }),
  'me.error.password-current-empty': {
    what: 'Ô mật khẩu hiện tại đang trống.',
    next: 'Nhập mật khẩu hiện tại để xác nhận đây là bạn.',
  },
  'me.error.password-too-short': (p: { min: number }): ErrorEntry => ({
    what: `Mật khẩu mới ngắn hơn ${String(p.min)} ký tự.`,
    next: 'Thêm ký tự vào ô mật khẩu mới rồi lưu lại.',
  }),
  'me.error.password-mismatch': {
    what: 'Hai ô mật khẩu mới chưa khớp.',
    next: 'Gõ lại ô xác nhận cho giống ô trên.',
  },
  /*
    Better Auth trả `INVALID_PASSWORD` khi mật khẩu HIỆN TẠI sai. Câu chữ phải
    chỉ đúng vào ô đó: nếu không, người dùng sẽ đi sửa ô mật khẩu MỚI.
  */
  'me.error.password-invalid': {
    what: 'Mật khẩu hiện tại không đúng.',
    next: 'Kiểm tra lại ô đầu tiên rồi lưu lại.',
    code: 'INVALID_PASSWORD',
  },
  'me.error.password-other': (p: { message: string }): ErrorEntry => ({
    what: `Không đổi được mật khẩu: ${p.message}`,
    next: 'Thử lại sau ít phút. Nếu vẫn hỏng thì đăng xuất rồi đăng nhập lại.',
  }),
  'me.error.password-unknown': {
    what: 'Không đổi được mật khẩu.',
    next: 'Kiểm tra kết nối rồi thử lại.',
  },
} as const satisfies Surface<'me'>;

/**
 * Sáu nhóm ba, và cả sáu là ba THẬT chứ không phải một hình dạng landing page.
 *
 * ⚠ Cả sáu được đặt LỒNG (`me.history.tab.*`) chứ không phẳng
 * (`me.history.tab-lessons`), và đó là một quyết định về khả năng gác chứ không
 * về thẩm mỹ. `scanThree` gom khoá theo tiền tố bỏ phân đoạn cuối, nên một nhóm
 * ba đặt tên phẳng rơi vào nhóm cha đông thành viên và đi qua T3 VÔ HÌNH. Lane
 * 16.C2 đã tự phát hiện đúng chỗ này và báo lại; đây là lượt đầu tiên áp dụng
 * từ đầu thay vì sửa sau.
 */
export const meIntentionalThree = {
  'me.history.tab':
    '2026-09-10: đúng ba loại lịch sử tồn tại ở tầng dữ liệu (me.listProgress, me.listLabAttempts, me.listQuizAttempts), không phải ba mục chọn ra cho đẹp.',
  'me.lessons.col':
    '2026-09-10: bảng tiến độ bài học chỉ dựng được ba cột từ dòng progress (lessonId, trạng thái, updatedAt). Không có step_count nên không có cột tỉ lệ.',
  'me.labs.status':
    '2026-09-10: đúng ba giá trị của LabAttemptStatus (in_progress, passed, failed), khớp computeLabStatus.',
  'me.role':
    '2026-09-10: đúng ba giá trị của cột users.role (user, author, admin), khớp admin.users.setRole.',
  'me.password.field':
    '2026-09-10: đổi mật khẩu cần đúng ba ô (hiện tại, mới, xác nhận lại). Bỏ ô xác nhận là bỏ phép kiểm gõ nhầm.',
  'me.shell':
    '2026-09-10: đúng ba shell mà image sandbox cài sẵn (bash, zsh, pwsh), khớp ShellName của server/sessions/preferences.ts.',
  'me.terminal-theme':
    '2026-09-10: đúng ba bảng màu trong THEME_NAMES của packages/terminal (dlp-dark, dlp-light, dlp-contrast).',
} as const satisfies IntentionalThree;
