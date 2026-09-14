import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `admin.`, sở hữu bởi lane 16.F (L5). Phủ năm màn quản trị:
 * `/admin`, `/admin/users`, `/admin/sessions`, `/admin/content`, `/admin/audit`.
 *
 * Mọi thông báo lỗi của lane là `ErrorEntry`, không phải `Static`: trang quản
 * trị là nơi một mã thoát trần dễ bị coi là đủ, và tầng kiểu ở đây từ chối đúng
 * thói quen đó. `code` là siêu dữ liệu để dán vào phiếu hỗ trợ, không bao giờ
 * là toàn bộ thông báo.
 *
 * ⛔ LUẬT GÕ PHÍM CỦA CẢ GÓI: không U+2014, U+2013, U+2015 ở bất kỳ đâu, kể cả
 * chú thích. Bốn chuỗi cũ mang U+2014 (`health-reading.ts` dòng 90, 200, 261 và
 * `overview-client.tsx`) đã được viết lại bằng dấu phẩy hoặc tách câu, không
 * bằng một ký tự thay thế trông giống.
 *
 * ## Bộ chọn của lane trả về CÂU, không trả về `CopyRef`
 *
 * Lane 16.C cho `catalog.` đổi bốn bộ chọn sang `CopyRef` (`{ key, params }`)
 * theo §1.6. Lane này giữ kiểu trả về `string` và gọi `t()` NGAY TRONG bộ chọn.
 * Hai đường mua đúng cùng một thứ mà §1.6 thật sự cần, và đây là phép đo:
 *
 * · Thứ §1.6 chống là hàm GHÉP CÂU tại chỗ, vì lúc đó bộ dò chỉ soi được nhánh
 *   mà probe đi vào. Ở lane này mọi nhánh của mọi bộ chọn là một khoá trong
 *   bản đồ dưới đây, kể cả nhánh nội suy (chúng là mục `Dynamic`, và đường ống
 *   dựng-giá-trị của `scan.ts` dựng đủ cả sáu dạng). Bộ dò đọc bản đồ, nên phủ
 *   là 100% ở cả hai cách.
 * · Cái `CopyRef` mua thêm là hoãn dựng câu tới nơi gọi. Lane này không có nơi
 *   nào cần hoãn: `describeRole` và bạn bè đổ thẳng vào JSX ở cùng một lượt.
 *
 * Cái giá của `CopyRef` thì có thật và đã được 16.C ghi lại: nó BỎ kiểm tham số
 * ở tầng biên dịch (`params` tụt xuống `Params`), phải bù bằng một ô test dựng
 * ra câu cho từng nhánh. Gọi `t()` thẳng giữ nguyên phép kiểm đó, nên `t('admin.
 * role-change.body', { email })` thiếu `from` là lỗi biên dịch chứ không phải
 * một chuỗi `{from}` còn nguyên trên màn hình.
 */
export const admin = {
  // ── Thanh điều hướng ────────────────────────────────────────────────────
  //
  // Năm màn, cố định bởi D12 (thêm màn phải hỏi chủ dự án). Nhãn a11y nằm cùng
  // nhóm vì nó là chữ người dùng đọc, chỉ khác đường đọc.
  'admin.nav.aria': 'Điều hướng quản trị',
  'admin.nav.overview': 'Tổng quan',
  'admin.nav.users': 'Người dùng',
  'admin.nav.classes': 'Lớp học',
  'admin.nav.sessions': 'Phiên đang chạy',
  'admin.nav.content': 'Nội dung',
  'admin.nav.audit': 'Nhật ký',

  // ── /admin, tổng quan ───────────────────────────────────────────────────
  'admin.overview.title': 'Tổng quan',
  'admin.overview.description': 'Sức chứa nền tảng và sức khoẻ các dịch vụ, đọc lúc mở trang.',
  'admin.overview.audit-title': 'Mọi hành động quản trị đều được ghi lại',
  'admin.overview.audit-body':
    'Đổi vai trò và kết thúc phiên của người khác đều ghi một dòng vào nhật ký, kèm tên người bấm.',
  'admin.overview.audit-link': 'Xem nhật ký',

  // ── Thẻ sức chứa ────────────────────────────────────────────────────────
  //
  // `null` = CHƯA BIẾT (quota đọc lỗi), và nó khác hẳn 0. Câu chữ ở đây phải
  // giữ được sự phân biệt đó: một con số sai ở trang quản trị là một quyết định
  // vận hành sai.
  'admin.capacity.title': 'Sức chứa',
  'admin.capacity.loading': 'Đang đọc sức chứa từ orchestrator.',
  'admin.capacity.unreadable':
    'Chưa đọc được sức chứa. Bấm Đọc lại; nếu vẫn không có số, xem trạng thái Orchestrator ở bảng sức khoẻ bên dưới.',
  'admin.capacity.retry': 'Đọc lại',
  'admin.capacity.fetched-at': (p: { at: string }) => `Đọc lúc ${p.at}, tự làm mới mỗi 15 giây.`,
  'admin.capacity.fetched-unknown': 'Thời điểm đọc không rõ.',
  'admin.capacity.unknown-badge': 'Chưa rõ sức chứa',
  'admin.capacity.quota-unreadable':
    'Orchestrator không đọc được ResourceQuota của namespace sandbox, nên không có trần nào để trừ. Xem quyền của Role sandbox (resourcequotas, limitranges).',
  'admin.capacity.quota-unreadable-reason': (p: { reason: string }) =>
    `Orchestrator không đọc được ResourceQuota của namespace sandbox: ${p.reason}`,
  // Số cũ mà không nói là số cũ thì đúng là thứ green-that-proves-nothing cảnh
  // báo. `use-capacity.tsx` cố ý giữ `data` qua một lượt hỏng để badge không
  // nhấp nháy, nên câu này là nửa còn lại của quyết định đó.
  'admin.capacity.stale': (p: { reason: string }) =>
    `Lượt đọc gần nhất lỗi (${p.reason}). Số ở trên có thể đã cũ.`,

  // ── Bảng sức khoẻ ───────────────────────────────────────────────────────
  'admin.health.title': 'Sức khoẻ nền tảng',
  'admin.health.loading': 'Đang đọc /metrics của orchestrator và gateway.',
  'admin.health.refetch': 'Đọc lại',
  'admin.health.fetched-at': (p: { at: string }) => ` Đọc lúc ${p.at}.`,
  'admin.health.pool-title': 'Pool pod ấm',
  'admin.health.alert-down-title': 'Không đọc được số liệu nào',
  'admin.health.alert-degraded-title': 'Bảng dưới đây đang thiếu một phần',
  'admin.health.col-metric': 'Chỉ số',
  'admin.health.col-labels': 'Nhãn',
  'admin.health.col-value': 'Giá trị',
  // Series không nhãn: trả một câu, KHÔNG trả ô trống và cũng không trả một
  // gạch ngang. Ô trống đọc ra là "bảng hỏng", gạch ngang đọc ra là "giá trị bị
  // giấu".
  'admin.health.no-labels': 'không nhãn',
  'admin.health.reason-missing': 'máy chủ không nêu lý do',

  'admin.health.source.orchestrator': 'Orchestrator',
  'admin.health.source.gateway': 'Terminal gateway',

  // Nguồn hỏng KHÔNG được vẽ như nguồn khoẻ, và hai kiểu hỏng đòi hai việc
  // khác nhau: không với tới (mạng, netpol, Service) khác với trả lời nhưng
  // không cho số dùng được (sai URL, dịch vụ không đăng ký metric).
  'admin.health.state.unreachable-label': 'Không với tới được',
  'admin.health.state.unreachable-detail': (p: { who: string; reason: string }) =>
    `${p.who} không trả lời: ${p.reason}. Chưa đọc được số liệu nào, và đó không phải "mọi chỉ số bằng 0". Kiểm NetworkPolicy và Service của nguồn này, hoặc đọc metric qua Prometheus.`,
  'admin.health.state.unhealthy-label': 'Trả lời nhưng không dùng được',
  'admin.health.state.unhealthy-detail': (p: { who: string; reason: string }) =>
    `${p.who} có trả lời nhưng không cho số liệu dùng được: ${p.reason}. Kiểm URL /metrics có trỏ đúng dịch vụ không, và dịch vụ có đăng ký metric dlp_* lúc khởi động không.`,
  'admin.health.state.ok-label': 'Đang phát metric',
  'admin.health.state.ok-detail': (p: { who: string; count: number }) =>
    `${p.who} trả lời và đang phát ${p.count} chỉ số dlp_*.`,

  'admin.health.summary.empty':
    'Không có nguồn metric nào để đọc. Bảng trống ở đây nghĩa là chưa cấu hình được gì, không phải hệ thống khoẻ.',
  'admin.health.summary.all-ok': (p: { total: number }) =>
    `Cả ${p.total} nguồn đều đang phát metric.`,
  'admin.health.summary.down': (p: { total: number; names: string }) =>
    `Không đọc được nguồn nào (0/${p.total}): ${p.names}. Mọi con số bên dưới đều thiếu.`,
  'admin.health.summary.degraded': (p: { ok: number; total: number; names: string }) =>
    `Đọc được ${p.ok}/${p.total} nguồn. Chưa đọc được: ${p.names}.`,

  'admin.health.pool.unknown':
    'Không đọc được pool từ orchestrator, và đó không phải "pool trống". Xem trạng thái nguồn Orchestrator ở trên.',
  'admin.health.pool.known': (p: { free: number; quarantine: number }) =>
    `${p.free} pod ấm sẵn sàng, ${p.quarantine} pod đang cách ly.`,

  'admin.health.metric.nan': 'NaN (nguồn báo không đo được)',
  'admin.health.metric.pos-inf': 'vô cực (+Inf)',
  'admin.health.metric.neg-inf': 'âm vô cực (-Inf)',

  // ── /admin/users ────────────────────────────────────────────────────────
  'admin.users.title': 'Người dùng',
  'admin.users.description':
    'Tìm theo email hoặc tên, và đổi vai trò. Mỗi lần đổi ghi một dòng vào nhật ký quản trị.',
  'admin.users.search-label': 'Tìm theo email hoặc tên',
  'admin.users.search-placeholder': 'vd. admin@example.com',
  'admin.users.search-submit': 'Tìm',
  'admin.users.clear-filter': 'Xoá bộ lọc',
  'admin.users.col-user': 'Người dùng',
  'admin.users.col-role': 'Vai trò',
  'admin.users.col-created': 'Ngày tạo',
  'admin.users.col-actions': 'Hành động',
  'admin.users.change-role': 'Đổi vai trò',
  'admin.users.role-field': 'Vai trò mới',
  'admin.users.self-note': 'Đây là tài khoản của bạn',
  // Câu tự đính chính phạm vi: bảng này chỉ nói về TRANG đang xem. Một dòng
  // "3 quản trị viên" đếm trên một trang đã cắt là một khẳng định sai về cả hệ
  // thống.
  'admin.users.note': (p: { count: number; page: number }) =>
    `Đang xem ${p.count} người ở trang ${p.page}`,
  'admin.users.note-more': ', còn trang sau, nên đừng đếm tổng từ bảng này.',
  'admin.users.empty-title': 'Chưa có người dùng nào',
  'admin.users.empty-title-query': (p: { query: string }) => `Không có ai khớp "${p.query}"`,
  'admin.users.empty-body': 'Bảng users đang trống, chưa ai đăng ký tài khoản.',
  'admin.users.empty-body-query':
    'Tìm khớp một phần trên email và tên, không phân biệt hoa thường. Thử một đoạn ngắn hơn.',
  'admin.users.back-first': 'Về trang đầu',
  'admin.users.toast-title': (p: { email: string }) => `Đã đổi vai trò của ${p.email}`,
  'admin.users.toast-body': (p: { role: string }) =>
    `Vai trò mới: ${p.role}. Đã ghi vào nhật ký quản trị kèm tên bạn.`,

  'admin.role.user': 'Người học',
  'admin.role.author': 'Người soạn bài',
  'admin.role.admin': 'Quản trị',

  // Câu xác nhận phải gọi tên người dùng VÀ cả hai vai trò. "Bạn có chắc
  // không?" là câu hỏi vô nghĩa cho một hành động sửa quyền của người khác.
  'admin.role-change.title': (p: { email: string }) => `Đổi vai trò của ${p.email}?`,
  'admin.role-change.body': (p: { email: string; from: string; to: string }) =>
    `${p.email}: ${p.from} thành ${p.to}. Việc này được ghi vào nhật ký quản trị kèm tên bạn, và có hiệu lực ở lần tải trang tiếp theo của người đó.`,
  'admin.role-change.confirm': (p: { to: string }) => `Đổi thành ${p.to}`,
  'admin.role-change.blocked-same': (p: { to: string }) =>
    `Người này đã là ${p.to}. Chọn một vai trò khác.`,
  'admin.role-change.blocked-self':
    'Đây là tài khoản của chính bạn. Tự hạ quyền quản trị sẽ khoá luôn trang /admin và chỉ mở lại được bằng SQL tay trên máy chủ, và máy chủ cũng từ chối việc này. Nhờ một quản trị viên khác đổi giúp.',

  // ── /admin/sessions ─────────────────────────────────────────────────────
  'admin.sessions.title': 'Phiên đang chạy',
  'admin.sessions.description':
    'Mọi phiên còn sống trên nền tảng, của mọi người dùng. Kết thúc một phiên sẽ thu hồi pod ngay.',
  'admin.sessions.alert-title': 'Danh sách này chỉ có phiên CÒN SỐNG',
  'admin.sessions.alert-body':
    'Orchestrator lọc bỏ phiên đã hết hạn, đã thu hồi hoặc lỗi trước khi trả về. Một phiên biến mất khỏi bảng nghĩa là nó đã kết thúc, không phải nó bị ẩn.',
  'admin.sessions.col-session': 'Phiên',
  'admin.sessions.col-owner': 'Chủ phiên',
  'admin.sessions.col-status': 'Trạng thái',
  'admin.sessions.col-expiry': 'Hạn',
  'admin.sessions.col-actions': 'Hành động',
  'admin.sessions.pod-line': (p: { pod: string; at: string }) => `pod ${p.pod} · tạo ${p.at}`,
  'admin.sessions.pod-unassigned': 'chưa cấp',
  'admin.sessions.owner-unknown': 'không rõ (máy chủ không trả về chủ phiên)',
  'admin.sessions.owner-self': (p: { id: string }) => `${p.id} (bạn)`,
  'admin.sessions.terminate': 'Kết thúc',
  'admin.sessions.note': (p: { count: number; page: number }) =>
    `Đang xem ${p.count} phiên ở trang ${p.page}`,
  'admin.sessions.note-more':
    ', còn trang sau, nên đây KHÔNG phải tổng số phiên đang chạy. Số tổng nằm ở trang Tổng quan.',
  'admin.sessions.empty-title': 'Không có phiên nào đang chạy',
  'admin.sessions.empty-body':
    'Chưa ai mở sandbox lúc này. Con số này khớp với sức chứa ở trang Tổng quan.',
  'admin.sessions.toast-title': 'Đã kết thúc phiên',
  'admin.sessions.toast-body': (p: { owner: string }) =>
    `Pod đã được thu hồi. Nhật ký ghi việc này dưới tên bạn, kèm chủ phiên ${p.owner}.`,

  // Trạng thái lạ (orchestrator thêm giá trị mới mà FE chưa biết) KHÔNG được
  // đọc ra "Đang chạy" và cũng không được thành ô trống.
  'admin.session-status.unspecified': 'Chưa xác định',
  'admin.session-status.pending': 'Đang chờ cấp pod',
  'admin.session-status.warm': 'Pod ấm trong pool',
  'admin.session-status.claimed': 'Đã nhận pod',
  'admin.session-status.running': 'Đang chạy',
  'admin.session-status.expired': 'Hết hạn',
  'admin.session-status.reaped': 'Đã thu hồi',
  'admin.session-status.failed': 'Lỗi',
  'admin.session-status.unknown': (p: { status: number }) => `Trạng thái lạ (${p.status})`,

  'admin.expiry.unknown': 'không rõ hạn',
  'admin.expiry.remaining': (p: { minutes: number }) => `còn ${p.minutes} phút`,
  'admin.expiry.now': 'tới hạn ngay bây giờ',
  // Quá hạn mà phiên vẫn còn trong danh sách là thông tin THẬT: reaper chưa
  // chạy tới nó. Hiện "còn -3 phút" thì không ai đọc ra điều đó.
  'admin.expiry.overdue': (p: { minutes: number }) => `quá hạn ${p.minutes} phút (reaper chưa dọn)`,

  'admin.terminate.title': (p: { id: string }) => `Kết thúc phiên ${p.id}?`,
  'admin.terminate.body': (p: { owner: string }) =>
    `Phiên này thuộc về ${p.owner}. Pod sẽ bị thu hồi ngay và mọi thứ chưa lưu trong đó sẽ mất; người đang dùng không được báo trước. Nhật ký ghi việc này dưới tên BẠN với lý do admin_terminated, không phải dưới tên chủ phiên.`,
  'admin.terminate.owner-self': 'chính bạn',
  'admin.terminate.confirm': 'Kết thúc phiên',

  // ── /admin/content ──────────────────────────────────────────────────────
  'admin.content.title': 'Nội dung',
  'admin.content.description':
    'Bài học, lab và playground của mọi người soạn. Mọi trạng thái, kể cả nháp.',
  // Lưu trữ KHÔNG ghi `admin_audit`, và điều đó phải nói ra chứ không giấu.
  'admin.content.alert-title': 'Lưu trữ không ghi vào nhật ký quản trị',
  'admin.content.alert-body':
    'Nút Lưu trữ đi qua đường của người soạn bài, không phải đường quản trị, nên nó không tạo dòng nào ở trang Nhật ký. Hai hành động có ghi nhật ký là đổi vai trò và kết thúc phiên.',
  'admin.content.state-label': 'Trạng thái',
  'admin.content.state-all': 'Tất cả',
  'admin.content.refetch': 'Đọc lại',
  'admin.content.col-title': 'Bài',
  'admin.content.col-kind': 'Loại',
  'admin.content.col-state': 'Trạng thái',
  'admin.content.col-author': 'Người soạn',
  'admin.content.col-updated': 'Sửa gần nhất',
  'admin.content.col-actions': 'Hành động',
  // `publishError` là kết quả CHẠY THỬ THẬT của P9, không phải một cờ. Giấu nó
  // đi là biến một trang quản trị thành một dấu tích.
  'admin.content.publish-error': (p: { reason: string }) => `Xuất bản lỗi: ${p.reason}`,
  'admin.content.archive-button': 'Lưu trữ',
  'admin.content.empty-title-all': 'Chưa có nội dung nào',
  'admin.content.empty-title-filtered': 'Không có bài nào ở trạng thái này',
  'admin.content.empty-body-all':
    'Chưa ai soạn bài trên nền tảng. Nội dung nướng sẵn trong image không nằm ở bảng này.',
  'admin.content.empty-body-filtered': 'Đổi bộ lọc trạng thái để xem các bài khác.',
  'admin.content.open-author': 'Mở trang soạn bài',
  'admin.content.show-all': 'Xem tất cả',
  // `authoring.list` trả CẢ danh sách nên con số này là tổng thật, khác hẳn
  // bảng người dùng và bảng phiên (có cursor).
  'admin.content.note-all': (p: { count: number }) =>
    `${p.count} bài, đây là toàn bộ danh sách (không phân trang).`,
  'admin.content.note-filtered': (p: { count: number; total: number }) =>
    `${p.count} bài khớp bộ lọc, trong tổng ${p.total} bài.`,
  'admin.content.toast-title': 'Đã lưu trữ',
  'admin.content.toast-body': (p: { title: string }) =>
    `"${p.title}" không còn hiện trong danh mục người học. Tiến độ đã ghi vẫn giữ nguyên.`,

  'admin.content-kind.lesson': 'Bài học',
  'admin.content-kind.lab': 'Lab',
  'admin.content-kind.playground': 'Playground',

  'admin.content-state.draft': 'Nháp',
  'admin.content-state.publishing': 'Đang xuất bản',
  'admin.content-state.published': 'Đã xuất bản',
  'admin.content-state.archived': 'Đã lưu trữ',

  // Lưu trữ KHÔNG phải xoá, và câu chữ phải nói ra: `progress.lesson_id` và
  // `lab_attempts.lab_id` là cột text KHÔNG có khoá ngoại.
  'admin.archive.what': (p: { kind: string; title: string }) => `${p.kind} "${p.title}"`,
  'admin.archive.title': (p: { what: string }) => `Lưu trữ ${p.what}?`,
  'admin.archive.confirm': 'Lưu trữ',
  'admin.archive.body': (p: { what: string }) =>
    `${p.what} sẽ biến khỏi danh mục người học, nhưng KHÔNG bị xoá: tiến độ và lượt làm lab đã ghi vẫn trỏ đúng vào nó. Người soạn vẫn mở lại và xuất bản lại được.`,
  'admin.archive.blocked-archived': 'Bài này đã ở trạng thái lưu trữ rồi.',
  'admin.archive.body-archived': (p: { what: string }) => `${p.what} đã được lưu trữ.`,
  'admin.archive.blocked-publishing':
    'Bài đang chạy thử xuất bản. Đợi lượt chạy thử kết thúc rồi lưu trữ, để kết quả chạy thử không ghi đè trạng thái vừa đặt.',
  'admin.archive.body-publishing': (p: { what: string }) =>
    `${p.what} đang trong lượt chạy thử xuất bản.`,

  // ── /admin/audit ────────────────────────────────────────────────────────
  'admin.audit.title': 'Nhật ký quản trị',
  'admin.audit.description':
    'Đổi vai trò và kết thúc phiên, mới nhất trước. Chỉ ghi thêm, không sửa được.',
  'admin.audit.alert-title': 'Đây là một nửa của nhật ký',
  'admin.audit.alert-body':
    'Bảng này ghi hành động của quản trị viên phía ứng dụng. Orchestrator ghi riêng sessions_audit cho mỗi lần thu hồi pod. Hai bảng biết hai chuyện khác nhau: bảng kia không biết tới vai trò, bảng này không biết phiên có thật sự chết hay không.',
  'admin.audit.col-when': 'Thời điểm',
  'admin.audit.col-actor': 'Người thực hiện',
  'admin.audit.col-action': 'Hành động',
  'admin.audit.col-target': 'Đối tượng',
  'admin.audit.col-detail': 'Chi tiết',
  'admin.audit.caption':
    'Cột "Người thực hiện" chỉ có id: bảng nhật ký cố ý không tham chiếu tới bảng người dùng, nên một tài khoản đã xoá vẫn để lại id ở đây.',
  // Hành động lạ (một bản BFF mới hơn ghi một `action` FE chưa biết) hiện
  // NGUYÊN chuỗi gốc; chỉ khi dòng nhật ký không ghi gì thì mới tới câu này.
  'admin.audit.action-missing': 'hành động không rõ (dòng nhật ký không ghi action)',
  'admin.audit.target': (p: { type: string; id: string }) => `${p.type} ${p.id}`,
  'admin.audit.target-unknown-id': (p: { type: string }) => `${p.type} (không rõ id)`,
  // ⛔ KHÔNG bao giờ trả chuỗi rỗng ở cột "ai làm". Một ô trống đọc ra là
  // "không ai làm", trong khi sự thật là "có người làm, ta chỉ không tra được
  // tên nữa".
  'admin.audit.actor-unknown': 'không rõ',
  'admin.audit.actor-unknown-note':
    'Dòng nhật ký này không ghi id người thực hiện. Bản BFF ghi ra nó có lỗi, chứ không phải "không ai làm".',
  'admin.audit.actor-note':
    'Chỉ có id: bảng nhật ký cố ý không tham chiếu tới bảng người dùng, nên một tài khoản đã xoá vẫn để lại id ở đây.',
  'admin.audit.note': (p: { count: number; page: number }) =>
    `Đang xem ${p.count} dòng ở trang ${p.page}`,
  'admin.audit.note-more': ', còn trang sau.',
  'admin.audit.note-last': ', đây là trang cuối.',
  'admin.audit.empty-title': 'Chưa có hành động quản trị nào',
  'admin.audit.empty-body':
    'Chưa ai đổi vai trò hay kết thúc phiên của người khác. Bảng trống ở đây nghĩa là chưa có việc gì xảy ra, không phải nhật ký hỏng.',

  'admin.audit-action.set-role': 'Đổi vai trò người dùng',
  'admin.audit-action.terminate': 'Kết thúc phiên của người dùng',

  'admin.audit-target.user': 'Người dùng',
  'admin.audit-target.session': 'Phiên',
  'admin.audit-target.class': 'Lớp học',

  'admin.audit-detail.none': 'không có chi tiết',
  'admin.audit-detail.role-change': (p: { from: string; to: string }) =>
    `vai trò: ${p.from} thành ${p.to}`,
  'admin.audit-detail.terminate': (p: { reason: string; owner: string }) =>
    `lý do: ${p.reason}, chủ phiên: ${p.owner}`,
  'admin.audit-detail.owner-unknown': 'không rõ',
  'admin.audit-detail.unreadable': 'chi tiết không đọc được (dữ liệu không chuyển được sang JSON)',

  // ── Hộp xác nhận dùng chung ─────────────────────────────────────────────
  'admin.confirm.cancel': 'Huỷ',

  // ── Lỗi ─────────────────────────────────────────────────────────────────
  //
  // Tất cả là `ErrorEntry`: hai nửa TÁCH RỜI ở tầng kiểu, không phải một chuỗi
  // mà người viết tự hứa là có đủ hai ý. `what` đi vào tiêu đề của `ErrorState`
  // hoặc `Alert`, `next` đi vào phần thân, nên hình dạng kiểu và hình dạng màn
  // hình là một.
  'admin.error.users-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được danh sách người dùng: ${p.reason}`,
    next: 'Bấm Thử lại. Nếu vẫn lỗi, kiểm kết nối tới cơ sở dữ liệu.',
  }),
  'admin.error.sessions-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được danh sách phiên: ${p.reason}`,
    next: 'Bấm Thử lại. Nếu vẫn lỗi, kiểm xem BFF có gọi được orchestrator qua gRPC không.',
  }),
  'admin.error.content-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được danh sách nội dung: ${p.reason}`,
    next: 'Bấm Thử lại. Nếu vẫn lỗi, kiểm kết nối tới cơ sở dữ liệu.',
  }),
  'admin.error.audit-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được nhật ký: ${p.reason}`,
    next: 'Bấm Về đầu nếu lỗi nói về cursor. Một dòng nhật ký không biến mất, nhưng cursor cũ có thể đã hết hiệu lực.',
  }),
  'admin.error.health': (p: { reason: string }): ErrorEntry => ({
    what: `Không đọc được bảng sức khoẻ: ${p.reason}`,
    next: 'Bấm Thử lại. Nếu vẫn lỗi, kiểm xem BFF có gọi được orchestrator không.',
  }),
  // `FORBIDDEN` là phán quyết có chủ đích của `setUserRole` (tự hạ quyền), nên
  // câu của máy chủ đã đúng và chỉ cần thêm phần "nên làm gì". Mọi mã khác có
  // thể là mạng chập hay lỗi thật, nên KHÔNG được nói chắc rằng dữ liệu chưa
  // đổi.
  'admin.error.role-forbidden': (p: { message: string }): ErrorEntry => ({
    what: `${p.message}.`,
    next: 'Vai trò giữ nguyên, không có gì thay đổi.',
  }),
  'admin.error.role-not-found': (p: { message: string }): ErrorEntry => ({
    what: `${p.message}.`,
    next: 'Tải lại danh sách. Tài khoản có thể vừa bị xoá.',
  }),
  'admin.error.role-other': (p: { message: string }): ErrorEntry => ({
    what: `Không đổi được vai trò: ${p.message}`,
    next: 'Tải lại danh sách để xem vai trò hiện tại trước khi thử lại.',
  }),
  'admin.error.terminate-not-found': (p: { message: string }): ErrorEntry => ({
    what: `${p.message}.`,
    next: 'Tải lại danh sách. Phiên có thể đã tự hết hạn hoặc vừa bị dọn.',
  }),
  'admin.error.terminate-other': (p: { message: string }): ErrorEntry => ({
    what: `Không kết thúc được phiên: ${p.message}`,
    next: 'Tải lại danh sách để xem phiên còn sống không trước khi thử lại.',
  }),
  'admin.error.archive': (p: { message: string }): ErrorEntry => ({
    what: `Không lưu trữ được bài: ${p.message}`,
    next: 'Đọc lại danh sách để xem trạng thái hiện tại trước khi thử lại.',
  }),

  // ── /admin/classes, lớp học (18.F) ──────────────────────────────────────
  //
  // Màn thứ SÁU của nhánh quản trị. Chú thích đầu file nói năm màn là cố định
  // bởi D12; con số đó đã cũ kể từ khi phase-18 §2 giao 18.F vào /admin, và lý
  // do nằm ở chính quyết định vai trò: giảng viên dùng lại role `admin`, nên
  // lớp học không có chỗ nào khác để ở.
  //
  // Chữ ở đây gọi người trong lớp là "sinh viên", không gọi là "thành viên"
  // chung chung: bảng `class_members` theo định nghĩa chỉ chứa sinh viên, còn
  // chủ lớp là một cột riêng. Dùng một từ mơ hồ cho một tập đã rõ sẽ làm người
  // đọc màn hình tưởng chủ lớp cũng nằm trong bảng.
  'admin.classes.title': 'Lớp học',
  'admin.classes.description':
    'Tạo lớp, thêm sinh viên, xem bảng điểm. Mỗi lớp thuộc về tài khoản quản trị đã tạo ra nó.',
  'admin.classes.back': 'Về danh sách lớp',

  'admin.classes.create-name-label': 'Tên lớp',
  'admin.classes.create-name-placeholder': 'D21CQCN01-B',
  'admin.classes.create-desc-label': 'Mô tả (không bắt buộc)',
  'admin.classes.create-desc-placeholder': 'Học kỳ 1, nhóm thực hành thứ Ba',
  'admin.classes.create-submit': 'Tạo lớp',

  'admin.classes.col-name': 'Lớp',
  'admin.classes.col-owner': 'Chủ lớp',
  'admin.classes.col-members': 'Sĩ số',
  'admin.classes.col-created': 'Ngày tạo',
  'admin.classes.col-actions': 'Thao tác',
  'admin.classes.open': 'Mở lớp',
  'admin.classes.no-description': 'Không có mô tả',

  'admin.classes.empty-title': 'Chưa có lớp nào',
  'admin.classes.empty-body': 'Tạo lớp đầu tiên bằng ô phía trên, rồi thêm sinh viên bằng email.',
  // Câu tự đính chính phạm vi, cùng khuôn `admin.users.note`: bảng chỉ nói về
  // TRANG đang xem, nên một con số đọc ra như tổng của cả hệ là một khẳng định
  // sai.
  'admin.classes.note': (p: { count: number; page: number }): string =>
    `Đang hiện ${String(p.count)} lớp ở trang ${String(p.page)}`,
  'admin.classes.note-more': ', còn trang tiếp theo.',
  'admin.classes.created-toast-title': (p: { name: string }): string => `Đã tạo lớp ${p.name}`,
  'admin.classes.created-toast-body': 'Mở lớp để thêm sinh viên bằng email.',

  'admin.classes.detail-owner': (p: { owner: string }): string => `Chủ lớp: ${p.owner}`,
  'admin.classes.members-title': 'Sinh viên',
  'admin.classes.members-description':
    'Thêm bằng email của tài khoản đã đăng ký. Chủ lớp không nằm trong danh sách này.',
  'admin.classes.add-email-label': 'Email sinh viên',
  'admin.classes.add-email-placeholder': 'sinhvien@ptit.edu.vn',
  'admin.classes.add-submit': 'Thêm vào lớp',
  'admin.classes.member-col-student': 'Sinh viên',
  'admin.classes.member-col-joined': 'Vào lớp',
  'admin.classes.members-empty-title': 'Lớp chưa có sinh viên nào',
  'admin.classes.members-empty-body':
    'Nhập email của một tài khoản đã đăng ký vào ô phía trên. Tài khoản chưa đăng ký thì chưa thêm được.',
  'admin.classes.members-note': (p: { count: number; page: number }): string =>
    `Đang hiện ${String(p.count)} sinh viên ở trang ${String(p.page)}`,
  'admin.classes.added-toast-title': (p: { email: string }): string => `Đã thêm ${p.email}`,
  'admin.classes.added-toast-body': 'Bảng điểm sẽ tính cả người vừa thêm.',
  'admin.classes.remove': 'Bỏ khỏi lớp',
  'admin.classes.remove-title': (p: { name: string }): string => `Bỏ ${p.name} khỏi lớp?`,
  'admin.classes.remove-body':
    'Lịch sử làm bài của người này KHÔNG bị xoá, chỉ tư cách thành viên lớp. Thêm lại được bất cứ lúc nào.',
  'admin.classes.remove-confirm': 'Bỏ khỏi lớp',
  'admin.classes.removed-toast-title': (p: { name: string }): string => `Đã bỏ ${p.name} khỏi lớp`,
  'admin.classes.removed-toast-body': 'Bảng điểm không còn tính người này nữa.',

  'admin.classes.scoreboard-title': 'Bảng điểm',
  // Phạm vi phải nói ra: bảng này chỉ đọc `problem_submissions`, tức là hệ bài
  // tập kiểu OJ. Lượt làm lab và lượt làm trắc nghiệm không vào đây, và một
  // bảng tên là "Bảng điểm" mà im lặng về chuyện đó sẽ bị đọc là điểm tổng kết.
  'admin.classes.scoreboard-description':
    'Chỉ tính bài tập kiểu OJ. Lượt làm lab và bài trắc nghiệm không nằm trong bảng này.',
  'admin.classes.score-col-student': 'Sinh viên',
  'admin.classes.score-col-attempted': 'Đã thử',
  'admin.classes.score-col-solved': 'Đã giải',
  'admin.classes.score-col-total': 'Tổng điểm',
  'admin.classes.score-col-last': 'Nộp gần nhất',
  'admin.classes.never-submitted': 'Chưa nộp',
  'admin.classes.score-empty-title': 'Chưa có gì để chấm',
  'admin.classes.score-empty-body': 'Thêm sinh viên vào lớp, bảng điểm sẽ hiện ngay khi có lượt nộp.',
  // Điểm mỗi bài lấy bản CAO NHẤT, không cộng dồn mọi lượt. Nói ra vì hai cách
  // tính cho hai con số rất khác nhau và người đọc không đoán được là cách nào.
  'admin.classes.score-note': 'Mỗi bài tính điểm cao nhất của người đó, không cộng dồn các lượt nộp lại.',

  'admin.error.classes-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không đọc được danh sách lớp: ${p.reason}`,
    next: 'Bấm Thử lại. Nếu vẫn lỗi, kiểm xem BFF có kết nối được Postgres không.',
  }),
  'admin.error.class-get': (p: { reason: string }): ErrorEntry => ({
    what: `Không mở được lớp: ${p.reason}`,
    next: 'Quay về danh sách lớp. Lớp có thể vừa bị xoá cùng tài khoản chủ lớp.',
  }),
  // `CONFLICT` là phán quyết có chủ đích của `createClass` (trùng tên), nên câu
  // của máy chủ đã đúng và chỉ cần thêm phần nên làm gì.
  'admin.error.class-create-conflict': (p: { message: string }): ErrorEntry => ({
    what: `${p.message}.`,
    next: 'Đặt một tên khác, hoặc mở lớp đã có trong danh sách bên dưới.',
  }),
  'admin.error.class-create-other': (p: { message: string }): ErrorEntry => ({
    what: `Không tạo được lớp: ${p.message}`,
    next: 'Tải lại danh sách để xem lớp đã được tạo chưa trước khi thử lại.',
  }),
  'admin.error.class-members': (p: { reason: string }): ErrorEntry => ({
    what: `Không đọc được danh sách sinh viên: ${p.reason}`,
    next: 'Bấm Thử lại. Bảng điểm bên dưới vẫn đọc độc lập với danh sách này.',
  }),
  'admin.error.class-add-known': (p: { message: string }): ErrorEntry => ({
    what: `${p.message}.`,
    next: 'Kiểm lại email, hoặc bảo sinh viên đăng ký tài khoản trước.',
  }),
  'admin.error.class-add-other': (p: { message: string }): ErrorEntry => ({
    what: `Không thêm được sinh viên: ${p.message}`,
    next: 'Tải lại danh sách để xem người đó đã vào lớp chưa trước khi thử lại.',
  }),
  'admin.error.class-remove': (p: { message: string }): ErrorEntry => ({
    what: `Không bỏ được sinh viên khỏi lớp: ${p.message}`,
    next: 'Tải lại danh sách để xem người đó còn trong lớp không trước khi thử lại.',
  }),
  'admin.error.class-scoreboard': (p: { reason: string }): ErrorEntry => ({
    what: `Không đọc được bảng điểm: ${p.reason}`,
    next: 'Bấm Thử lại. Danh sách sinh viên phía trên vẫn đọc độc lập với bảng này.',
  }),
} as const satisfies Surface<'admin'>;

export const adminIntentionalThree = {
  'admin.role':
    '2026-09-10: đúng ba vai trò tồn tại trong pgEnum user_role tại apps/web/src/server/db/schema.ts (user, admin, author), và ViewerRole ở components/shell/nav.ts là union đóng của đúng ba giá trị đó. Vai trò thứ tư nào cũng phải sửa enum DB trước.',
  'admin.content-kind':
    '2026-09-10: đúng ba loại nội dung tồn tại trong CONTENT_KINDS tại packages/shared-types/src/authoring.ts (lesson, lab, playground). Bảng KIND_LABEL là Record<ContentKind, ...> nên loại thứ tư là lỗi biên dịch trước khi là một câu thiếu.',
  'admin.health.metric':
    '2026-09-10: đúng ba giá trị double của IEEE 754 không phải số hữu hạn (NaN, +Infinity, -Infinity), và formatMetricValue phân nhánh đúng ba lần vì Number.isFinite chia miền thành đúng bốn ca. Không phải một phân loại ba, mà là ba ca còn lại sau khi loại số hữu hạn.',
  'admin.audit-target':
    '2026-09-14: đúng ba loại đối tượng mà nhật ký quản trị GHI thật, đọc từ chỗ gọi writeAuditLog chứ không từ một danh sách khai sẵn: user (đổi vai trò), session (buộc dừng), class (tạo/thêm-bớt thành viên, §18.F). Ba là số hiện tại, không phải số đẹp. describeAuditTarget còn một nhánh cuối trả thẳng targetType, nên loại thứ tư vẫn HIỆN RA được, chỉ hiện bằng chuỗi thô tiếng Anh. Đó là lý do nhóm này phải được rà lại mỗi lần thêm một loại đối tượng, khác hẳn admin.role vốn được enum DB gác.',
} as const satisfies IntentionalThree;
