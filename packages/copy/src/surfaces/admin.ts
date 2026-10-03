import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `admin.`, sở hữu bởi lane admin (bản dựng lại PTIT, 2026-10-03).
 * Phủ bảy màn quản trị: tổng quan, người dùng, lớp, kỳ thi, phiên, nội dung,
 * nhật ký.
 *
 * Mọi thông báo lỗi là `ErrorEntry`, không phải `Static`: trang quản trị là nơi
 * một mã thoát trần dễ bị coi là đủ, và tầng kiểu ở đây từ chối đúng thói quen
 * đó. `what` nói chuyện gì hỏng, `next` nói làm gì tiếp.
 *
 * ⛔ LUẬT GÕ PHÍM CỦA CẢ GÓI: không U+2014, U+2013, U+2015 ở bất kỳ đâu, kể cả
 * chú thích. Dấu chấm giữa luôn có đúng một dấu cách hai bên.
 *
 * ## Hai loại khoá trong file này
 *
 * · Khoá của các hàm thuần (`role-change.ts`, `session-row.ts`,
 *   `content-row.ts`, `audit-row.ts`, `health-reading.ts`). Test logic của
 *   chúng ghim chữ VIẾT THẲNG, nên câu ở đây đổi thì test đỏ: đổi có chủ ý.
 * · Khoá của màn hình (tiêu đề, câu dẫn, nút, cột). Viết theo giọng
 *   design-brief §8: ngắn, nói sự thật hoặc việc cần làm trước.
 *
 * ## Câu có số nằm trong (`Num`)
 *
 * Câu như "12 phiên đang chạy, còn 18/30 chỗ" nhận tham số kiểu `string`, không
 * `number`. Nơi gọi truyền một chỗ giữ (`numSlot(i)` ở
 * `apps/web/src/components/admin/with-nums.tsx`) rồi thay chỗ giữ bằng `<Num>`.
 * Trật tự từ vì vậy vẫn nằm trọn trong bản đồ, không bị cắt thành mảnh.
 */
export const admin = {
  // ── Khung chung ──────────────────────────────────────────────────────────
  'admin.crumb.root': 'Quản trị',
  // Một động từ cho việc "lấy lại dữ liệu" ở mọi màn quản trị.
  'admin.reload': 'Tải lại',
  'admin.pager.first': 'Về đầu',

  // ── /admin, tổng quan ────────────────────────────────────────────────────
  'admin.overview.kicker': 'Quản trị · số đọc trực tiếp từ cụm',
  'admin.overview.title': 'Tổng quan',
  'admin.overview.lead':
    'Còn bao nhiêu chỗ, có đủ pod chờ sẵn không, và ai vừa bấm gì trong trang quản trị.',
  'admin.overview.board-load': (p: { running: string; free: string; total: string }) =>
    `${p.running} phiên đang chạy, còn ${p.free}/${p.total} chỗ cho bài thường.`,
  'admin.overview.board-running': (p: { running: string }) =>
    `${p.running} phiên đang chạy. Chưa tính được còn bao nhiêu chỗ.`,
  'admin.overview.recent-title': 'Nhật ký gần đây',
  'admin.overview.recent-lead':
    'Năm dòng mới nhất. Lưu trữ nội dung không có ở đây: nút đó đi đường của người soạn bài.',
  'admin.overview.recent-link': 'Xem toàn bộ nhật ký',
  'admin.overview.recent-empty': 'Chưa có hành động quản trị nào được ghi.',

  // ── Sức chứa ─────────────────────────────────────────────────────────────
  //
  // `null` = CHƯA BIẾT (quota đọc lỗi), và nó khác hẳn 0. Một con số sai ở
  // trang quản trị là một quyết định vận hành sai.
  'admin.capacity.title': 'Sức chứa',
  'admin.capacity.loading': 'Đang đọc sức chứa từ orchestrator.',
  'admin.capacity.unreadable':
    'Chưa đọc được sức chứa. Bấm Tải lại; vẫn không có số thì xem nguồn Orchestrator ở phần sức khoẻ bên dưới.',
  'admin.capacity.retry': 'Tải lại',
  'admin.capacity.fetched-at': (p: { at: string }) => `Đọc lúc ${p.at}, tự làm mới mỗi 15 giây.`,
  'admin.capacity.fetched-unknown': 'Không rõ thời điểm đọc.',
  'admin.capacity.meter-label': 'Số chỗ đã dùng cho bài thường',
  'admin.capacity.profiles-note':
    'Bài có IDE hoặc lab Kubernetes tốn tài nguyên hơn nên có trần riêng, thấp hơn số này.',
  'admin.capacity.full': 'Hết chỗ. Phiên mới bị từ chối cho tới khi có phiên đóng hoặc hết hạn.',
  'admin.capacity.low': (p: { percent: number }) =>
    `Sắp kín: còn dưới ${String(p.percent)}% số chỗ. Báo lớp mở phiên sớm nếu sắp có giờ thực hành.`,
  'admin.capacity.quota-unreadable':
    'Orchestrator không đọc được ResourceQuota của namespace sandbox, nên không có trần nào để trừ. Xem quyền của Role sandbox (resourcequotas, limitranges).',
  'admin.capacity.quota-unreadable-reason': (p: { reason: string }) =>
    `Orchestrator không đọc được ResourceQuota của namespace sandbox: ${p.reason}`,
  // `use-capacity.tsx` cố ý giữ `data` qua một lượt hỏng để số không nhấp
  // nháy; câu này là nửa còn lại của quyết định đó.
  'admin.capacity.stale': (p: { reason: string }) =>
    `Lượt đọc gần nhất lỗi (${p.reason}). Số ở trên có thể đã cũ.`,

  // ── Sức khoẻ nền tảng ────────────────────────────────────────────────────
  'admin.health.title': 'Sức khoẻ nền tảng',
  'admin.health.loading': 'Đang đọc /metrics của orchestrator và gateway.',
  'admin.health.refetch': 'Tải lại',
  'admin.health.fetched-at': (p: { at: string }) => `Đọc lúc ${p.at}, không tự làm mới.`,
  'admin.health.pool-title': 'Pod chờ sẵn',
  'admin.health.pool-sentence': (p: { free: string; quarantine: string }) =>
    `${p.free} pod chờ sẵn, ${p.quarantine} pod đang cách ly.`,
  'admin.health.pool-dry': 'Hết pod chờ sẵn. Phiên mới phải đợi tạo pod từ đầu, chậm hơn vài chục giây.',
  'admin.health.pool-free': 'Sẵn sàng',
  'admin.health.pool-quarantine': 'Cách ly',
  'admin.health.sources-title': 'Nguồn metric',
  'admin.health.series-toggle': (p: { count: number }) => `Xem ${String(p.count)} chỉ số`,
  'admin.health.alert-down-title': 'Không đọc được số liệu nào',
  'admin.health.alert-degraded-title': 'Phần sức khoẻ đang thiếu một nguồn',
  'admin.health.col-metric': 'Chỉ số',
  'admin.health.col-labels': 'Nhãn',
  'admin.health.col-value': 'Giá trị',
  // Series không nhãn: trả một câu, KHÔNG trả ô trống và cũng không trả một
  // gạch ngang. Ô trống đọc ra là "bảng hỏng".
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
    'Không đọc được số pod chờ sẵn từ orchestrator, và đó không phải "hết pod". Xem trạng thái nguồn Orchestrator bên dưới.',
  'admin.health.pool.known': (p: { free: number; quarantine: number }) =>
    `${p.free} pod chờ sẵn, ${p.quarantine} pod đang cách ly.`,

  'admin.health.metric.nan': 'NaN (nguồn báo không đo được)',
  'admin.health.metric.pos-inf': 'vô cực (+Inf)',
  'admin.health.metric.neg-inf': 'âm vô cực (-Inf)',

  // ── /admin/users ─────────────────────────────────────────────────────────
  'admin.users.kicker': 'Quản trị · tài khoản và vai trò',
  'admin.users.title': 'Người dùng',
  'admin.users.lead':
    'Tìm theo email hoặc tên rồi đổi vai trò. Mỗi lần đổi ghi một dòng nhật ký kèm tên bạn.',
  'admin.users.search-label': 'Tìm theo email hoặc tên',
  'admin.users.search-placeholder': 'vd. sinhvien@ptit.edu.vn',
  'admin.users.search-submit': 'Tìm',
  'admin.users.filter-chip': (p: { query: string }) => `Đang lọc "${p.query}"`,
  'admin.users.clear-filter': 'Bỏ lọc',
  'admin.users.col-user': 'Người dùng',
  'admin.users.col-role': 'Vai trò',
  'admin.users.col-created': 'Ngày tạo',
  'admin.users.col-actions': 'Thao tác',
  'admin.users.change-role': 'Đổi vai trò',
  'admin.users.role-field': 'Vai trò mới',
  'admin.users.self-note': 'Tài khoản của bạn',
  // Câu tự đính chính phạm vi: bảng chỉ nói về TRANG đang xem.
  'admin.users.note': (p: { count: number; page: number }) =>
    `${String(p.count)} người ở trang ${String(p.page)}`,
  'admin.users.note-more': ', còn trang sau.',
  'admin.users.empty-title': 'Chưa có tài khoản nào',
  'admin.users.empty-title-query': (p: { query: string }) => `Không ai khớp "${p.query}"`,
  'admin.users.empty-body': 'Chưa có ai đăng ký.',
  'admin.users.empty-body-query':
    'Tìm khớp một phần trên email và tên, không phân biệt hoa thường. Thử một đoạn ngắn hơn.',
  'admin.users.back-first': 'Bỏ lọc, về trang đầu',
  'admin.users.toast-title': (p: { email: string }) => `Đã đổi vai trò của ${p.email}`,
  'admin.users.toast-body': (p: { role: string }) =>
    `Vai trò mới: ${p.role}. Nhật ký quản trị đã ghi kèm tên bạn.`,

  'admin.role.user': 'Người học',
  'admin.role.author': 'Người soạn bài',
  'admin.role.admin': 'Quản trị',

  // Câu xác nhận gọi tên người dùng VÀ cả hai vai trò. "Bạn có chắc không?" là
  // câu hỏi vô nghĩa cho một hành động sửa quyền của người khác.
  'admin.role-change.title': (p: { email: string }) => `Đổi vai trò của ${p.email}?`,
  'admin.role-change.body': (p: { email: string; from: string; to: string }) =>
    `${p.email}: ${p.from} thành ${p.to}. Việc này được ghi vào nhật ký quản trị kèm tên bạn, và có hiệu lực ở lần tải trang tiếp theo của người đó.`,
  'admin.role-change.confirm': (p: { to: string }) => `Đổi thành ${p.to}`,
  'admin.role-change.blocked-same': (p: { to: string }) =>
    `Người này đã là ${p.to}. Chọn một vai trò khác.`,
  'admin.role-change.blocked-self':
    'Đây là tài khoản của chính bạn. Tự hạ quyền quản trị sẽ khoá luôn trang /admin và chỉ mở lại được bằng SQL tay trên máy chủ, và máy chủ cũng từ chối việc này. Nhờ một quản trị viên khác đổi giúp.',

  // ── /admin/sessions ──────────────────────────────────────────────────────
  'admin.sessions.kicker': 'Quản trị · sandbox đang sống',
  'admin.sessions.title': 'Phiên đang chạy',
  'admin.sessions.lead':
    'Phiên của mọi người đang mở lúc này. Kết thúc một phiên là thu hồi pod ngay, người đang gõ không được báo trước.',
  'admin.sessions.alert-title': 'Danh sách này chỉ có phiên còn chạy',
  'admin.sessions.alert-body':
    'Phiên đã hết hạn, đã thu hồi hoặc lỗi không có ở đây. Một phiên biến khỏi bảng là nó đã kết thúc, không phải bị ẩn.',
  'admin.sessions.col-session': 'Phiên',
  'admin.sessions.col-owner': 'Chủ phiên',
  'admin.sessions.col-status': 'Trạng thái',
  'admin.sessions.col-expiry': 'Hạn',
  'admin.sessions.col-actions': 'Thao tác',
  'admin.sessions.pod-line': (p: { pod: string; at: string }) => `pod ${p.pod} · tạo ${p.at}`,
  'admin.sessions.pod-unassigned': 'chưa cấp',
  'admin.sessions.owner-unknown': 'không rõ (máy chủ không trả về chủ phiên)',
  'admin.sessions.owner-self': (p: { id: string }) => `${p.id} (bạn)`,
  'admin.sessions.terminate': 'Kết thúc',
  'admin.sessions.note': (p: { count: number; page: number }) =>
    `${String(p.count)} phiên ở trang ${String(p.page)}`,
  'admin.sessions.note-more':
    ', còn trang sau. Tổng số phiên nằm ở trang Tổng quan.',
  'admin.sessions.empty-title': 'Không có phiên nào đang chạy',
  'admin.sessions.empty-body':
    'Chưa ai mở sandbox lúc này. Số này khớp với sức chứa ở trang Tổng quan.',
  'admin.sessions.toast-title': 'Đã kết thúc phiên',
  'admin.sessions.toast-body': (p: { owner: string }) =>
    `Pod đã được thu hồi. Nhật ký ghi việc này dưới tên bạn, kèm chủ phiên ${p.owner}.`,

  // Trạng thái lạ (orchestrator thêm giá trị mới mà FE chưa biết) KHÔNG được
  // đọc ra "Đang chạy" và cũng không được thành ô trống.
  'admin.session-status.unspecified': 'Chưa xác định',
  'admin.session-status.pending': 'Đang chờ cấp pod',
  'admin.session-status.warm': 'Pod chờ sẵn',
  'admin.session-status.claimed': 'Đã nhận pod',
  'admin.session-status.running': 'Đang chạy',
  'admin.session-status.expired': 'Hết hạn',
  'admin.session-status.reaped': 'Đã thu hồi',
  'admin.session-status.failed': 'Lỗi',
  'admin.session-status.unknown': (p: { status: number }) => `Trạng thái lạ (${p.status})`,

  'admin.expiry.unknown': 'không rõ hạn',
  'admin.expiry.remaining': (p: { minutes: number }) => `còn ${p.minutes} phút`,
  'admin.expiry.now': 'tới hạn ngay bây giờ',
  // Quá hạn mà phiên vẫn còn trong danh sách là thông tin THẬT: lượt dọn phiên
  // chưa chạy tới nó. Hiện "còn -3 phút" thì không ai đọc ra điều đó.
  'admin.expiry.overdue': (p: { minutes: number }) => `quá hạn ${p.minutes} phút, sắp được dọn`,

  'admin.terminate.title': (p: { id: string }) => `Kết thúc phiên ${p.id}?`,
  'admin.terminate.body': (p: { owner: string }) =>
    `Phiên này thuộc về ${p.owner}. Pod bị thu hồi ngay và mọi thứ chưa lưu trong đó sẽ mất; người đang dùng không được báo trước. Nhật ký ghi việc này dưới tên bạn, không phải tên chủ phiên.`,
  'admin.terminate.owner-self': 'chính bạn',
  'admin.terminate.confirm': 'Kết thúc phiên',

  // ── /admin/content ───────────────────────────────────────────────────────
  'admin.content.kicker': 'Quản trị · bài của mọi người soạn',
  'admin.content.title': 'Nội dung',
  'admin.content.lead':
    'Bài học, lab và playground của mọi tác giả, ở mọi trạng thái kể cả nháp. Lưu trữ làm bài biến khỏi danh mục, không xoá.',
  // Lưu trữ KHÔNG ghi `admin_audit`, và điều đó phải nói ra chứ không giấu.
  'admin.content.alert-title': 'Lưu trữ không ghi vào nhật ký quản trị',
  'admin.content.alert-body':
    'Nút Lưu trữ đi qua đường của người soạn bài, không qua đường quản trị, nên nó không tạo dòng nào ở trang Nhật ký. Đổi vai trò, kết thúc phiên, thao tác lớp học và kỳ thi thì có ghi.',
  'admin.content.filter-label': 'Lọc theo trạng thái',
  'admin.content.state-all': 'Tất cả',
  'admin.content.refetch': 'Tải lại',
  'admin.content.col-title': 'Bài',
  'admin.content.col-kind': 'Loại',
  'admin.content.col-state': 'Trạng thái',
  'admin.content.col-author': 'Người soạn',
  'admin.content.col-updated': 'Sửa gần nhất',
  'admin.content.col-actions': 'Thao tác',
  // `publishError` là kết quả CHẠY THỬ THẬT của P9, không phải một cờ.
  'admin.content.publish-error': (p: { reason: string }) => `Xuất bản lỗi: ${p.reason}`,
  'admin.content.archive-button': 'Lưu trữ',
  'admin.content.empty-title-all': 'Chưa có bài nào',
  'admin.content.empty-title-filtered': 'Không có bài nào ở trạng thái này',
  'admin.content.empty-body-all':
    'Chưa ai soạn bài trên nền tảng. Bài có sẵn trong image không nằm ở bảng này.',
  'admin.content.empty-body-filtered': 'Chọn trạng thái khác để xem các bài còn lại.',
  'admin.content.open-author': 'Mở Xưởng soạn',
  'admin.content.show-all': 'Xem tất cả',
  // `authoring.list` trả CẢ danh sách nên con số này là tổng thật, khác hẳn
  // bảng người dùng và bảng phiên (có cursor).
  'admin.content.note-all': (p: { count: number }) =>
    `${String(p.count)} bài, đủ cả danh sách (không phân trang).`,
  'admin.content.note-filtered': (p: { count: number; total: number }) =>
    `${String(p.count)} bài khớp bộ lọc, trong tổng ${String(p.total)} bài.`,
  'admin.content.toast-title': 'Đã lưu trữ',
  'admin.content.toast-body': (p: { title: string }) =>
    `"${p.title}" không còn hiện trong danh mục người học. Tiến độ đã ghi vẫn giữ nguyên.`,

  'admin.content-kind.lesson': 'Bài học',
  'admin.content-kind.lab': 'Lab',
  'admin.content-kind.playground': 'Sân chơi',

  'admin.content-state.draft': 'Nháp',
  'admin.content-state.publishing': 'Đang xuất bản',
  'admin.content-state.published': 'Đã xuất bản',
  'admin.content-state.archived': 'Đã lưu trữ',

  // Lưu trữ KHÔNG phải xoá: `progress.lesson_id` và `lab_attempts.lab_id` là
  // cột text KHÔNG có khoá ngoại.
  'admin.archive.what': (p: { kind: string; title: string }) => `${p.kind} "${p.title}"`,
  'admin.archive.title': (p: { what: string }) => `Lưu trữ ${p.what}?`,
  'admin.archive.confirm': 'Lưu trữ',
  'admin.archive.body': (p: { what: string }) =>
    `${p.what} sẽ biến khỏi danh mục người học nhưng không bị xoá: tiến độ và lượt làm lab đã ghi vẫn trỏ đúng vào nó. Người soạn vẫn mở lại và xuất bản lại được.`,
  'admin.archive.blocked-archived': 'Bài này đã ở trạng thái lưu trữ rồi.',
  'admin.archive.body-archived': (p: { what: string }) => `${p.what} đã được lưu trữ.`,
  'admin.archive.blocked-publishing':
    'Bài đang chạy thử xuất bản. Đợi lượt chạy thử kết thúc rồi lưu trữ, để kết quả chạy thử không ghi đè trạng thái vừa đặt.',
  'admin.archive.body-publishing': (p: { what: string }) =>
    `${p.what} đang trong lượt chạy thử xuất bản.`,

  // ── /admin/audit ─────────────────────────────────────────────────────────
  'admin.audit.kicker': 'Quản trị · chỉ ghi thêm, không sửa',
  'admin.audit.title': 'Nhật ký quản trị',
  'admin.audit.lead':
    'Ai đã đổi vai trò, kết thúc phiên, sửa lớp hay kỳ thi, mới nhất trước. Không dòng nào sửa hay xoá được.',
  'admin.audit.alert-title': 'Đây là một nửa của nhật ký',
  'admin.audit.alert-body':
    'Bảng này ghi việc quản trị viên làm trong trang quản trị. Lần thu hồi pod nào cũng được ghi ở một nhật ký riêng phía máy chủ phiên. Hai nhật ký biết hai chuyện khác nhau: nhật ký kia không biết tới vai trò, bảng này không biết phiên đã thật sự dừng hay chưa.',
  'admin.audit.col-when': 'Thời điểm',
  'admin.audit.col-actor': 'Người thực hiện',
  'admin.audit.col-action': 'Hành động',
  'admin.audit.col-target': 'Đối tượng',
  'admin.audit.col-detail': 'Chi tiết',
  'admin.audit.caption':
    'Cột "Người thực hiện" chỉ có id: bảng nhật ký cố ý không tham chiếu tới bảng người dùng, nên một tài khoản đã xoá vẫn để lại id ở đây.',
  // Hành động lạ (một bản máy chủ mới hơn ghi một `action` FE chưa biết) hiện
  // NGUYÊN chuỗi gốc; chỉ khi dòng nhật ký không ghi gì thì mới tới câu này.
  'admin.audit.action-missing': 'hành động không rõ (dòng nhật ký không ghi action)',
  'admin.audit.target': (p: { type: string; id: string }) => `${p.type} ${p.id}`,
  'admin.audit.target-unknown-id': (p: { type: string }) => `${p.type} (không rõ id)`,
  // ⛔ KHÔNG bao giờ trả chuỗi rỗng ở cột "ai làm". Ô trống đọc ra là "không ai
  // làm", trong khi sự thật là "có người làm, ta chỉ không tra được tên nữa".
  'admin.audit.actor-unknown': 'không rõ',
  'admin.audit.actor-unknown-note':
    'Dòng này thiếu người thực hiện do lỗi lúc ghi, không phải "không ai làm".',
  'admin.audit.actor-note':
    'Chỉ có id: bảng nhật ký cố ý không tham chiếu tới bảng người dùng, nên một tài khoản đã xoá vẫn để lại id ở đây.',
  'admin.audit.note': (p: { count: number; page: number }) =>
    `${String(p.count)} dòng ở trang ${String(p.page)}`,
  'admin.audit.note-more': ', còn trang sau.',
  'admin.audit.note-last': ', đây là trang cuối.',
  'admin.audit.empty-title': 'Chưa có hành động quản trị nào',
  'admin.audit.empty-body':
    'Chưa ai đổi vai trò, kết thúc phiên hay sửa lớp và kỳ thi. Bảng trống nghĩa là chưa có việc gì xảy ra, không phải nhật ký hỏng.',

  // Mỗi `action` mà server ghi thật (grep `action: '` trong server/trpc/routers)
  // có một nhãn. Hành động chưa có nhãn hiện nguyên chuỗi gốc, không rỗng.
  'admin.audit-action.set-role': 'Đổi vai trò người dùng',
  'admin.audit-action.terminate': 'Kết thúc phiên của người dùng',
  'admin.audit-action.class-create': 'Tạo lớp',
  'admin.audit-action.class-add-member': 'Thêm sinh viên vào lớp',
  'admin.audit-action.class-remove-member': 'Bỏ sinh viên khỏi lớp',
  'admin.audit-action.exam-create': 'Tạo kỳ thi',
  'admin.audit-action.exam-update': 'Sửa kỳ thi',
  'admin.audit-action.exam-remove': 'Xoá kỳ thi',

  'admin.audit-target.user': 'Người dùng',
  'admin.audit-target.session': 'Phiên',
  'admin.audit-target.class': 'Lớp học',
  'admin.audit-target.exam': 'Kỳ thi',

  'admin.audit-detail.none': 'không có chi tiết',
  'admin.audit-detail.role-change': (p: { from: string; to: string }) =>
    `vai trò: ${p.from} thành ${p.to}`,
  'admin.audit-detail.terminate': (p: { reason: string; owner: string }) =>
    `lý do: ${p.reason}, chủ phiên: ${p.owner}`,
  'admin.audit-detail.owner-unknown': 'không rõ',
  'admin.audit-detail.unreadable': 'chi tiết không đọc được (dữ liệu không chuyển được sang JSON)',

  // ── /admin/classes ───────────────────────────────────────────────────────
  //
  // Người trong lớp là "sinh viên", không phải "thành viên": bảng
  // `class_members` theo định nghĩa chỉ chứa sinh viên, chủ lớp là cột riêng.
  'admin.classes.kicker': 'Quản trị · lớp, sĩ số, bảng điểm',
  'admin.classes.title': 'Lớp học',
  'admin.classes.lead':
    'Tạo lớp, thêm sinh viên bằng email, xem bảng điểm bài tập. Lớp thuộc về tài khoản quản trị đã tạo nó.',
  'admin.classes.create-title': 'Tạo lớp',
  'admin.classes.create-name-label': 'Tên lớp',
  'admin.classes.create-name-placeholder': 'D21CQCN01-B',
  'admin.classes.create-desc-label': 'Mô tả (không bắt buộc)',
  'admin.classes.create-desc-placeholder': 'Học kỳ 1, nhóm thực hành thứ Ba',
  'admin.classes.create-submit': 'Tạo lớp',
  'admin.classes.list-title': 'Các lớp',
  'admin.classes.col-name': 'Lớp',
  'admin.classes.col-owner': 'Chủ lớp',
  'admin.classes.col-members': 'Sĩ số',
  'admin.classes.col-created': 'Ngày tạo',
  'admin.classes.col-actions': 'Thao tác',
  'admin.classes.open': 'Mở lớp',
  'admin.classes.no-description': 'Không có mô tả',
  'admin.classes.empty-title': 'Chưa có lớp nào',
  'admin.classes.empty-body': 'Tạo lớp đầu tiên bằng ô bên trên, rồi thêm sinh viên bằng email.',
  'admin.classes.note': (p: { count: number; page: number }): string =>
    `${String(p.count)} lớp ở trang ${String(p.page)}`,
  'admin.classes.note-more': ', còn trang tiếp theo.',
  'admin.classes.created-toast-title': (p: { name: string }): string => `Đã tạo lớp ${p.name}`,
  'admin.classes.created-toast-body': 'Mở lớp để thêm sinh viên bằng email.',

  'admin.classes.detail-title': 'Lớp học',
  'admin.classes.back-list': 'Về danh sách lớp',
  'admin.classes.detail-lead': (p: { owner: string; count: string }): string =>
    `Chủ lớp ${p.owner}. Sĩ số ${p.count}.`,
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
    'Nhập email của một tài khoản đã đăng ký vào ô bên trên. Tài khoản chưa đăng ký thì chưa thêm được.',
  'admin.classes.members-note': (p: { count: number; page: number }): string =>
    `${String(p.count)} sinh viên ở trang ${String(p.page)}`,
  'admin.classes.added-toast-title': (p: { email: string }): string => `Đã thêm ${p.email}`,
  'admin.classes.added-toast-body': 'Bảng điểm đã tính cả người vừa thêm.',
  'admin.classes.remove': 'Bỏ khỏi lớp',
  'admin.classes.remove-title': (p: { name: string }): string => `Bỏ ${p.name} khỏi lớp?`,
  'admin.classes.remove-body':
    'Người này rời danh sách sinh viên và bảng điểm của lớp. Thêm lại được bất cứ lúc nào.',
  'admin.classes.remove-loss':
    'Tư cách thành viên lớp. Lịch sử làm bài của người này vẫn giữ nguyên.',
  'admin.classes.remove-confirm': 'Bỏ khỏi lớp',
  'admin.classes.removed-toast-title': (p: { name: string }): string => `Đã bỏ ${p.name} khỏi lớp`,
  'admin.classes.removed-toast-body': 'Bảng điểm không còn tính người này.',

  'admin.classes.scoreboard-title': 'Bảng điểm',
  // Phạm vi phải nói ra: bảng này chỉ đọc `problem_submissions`. Lab và trắc
  // nghiệm không vào đây.
  'admin.classes.scoreboard-description':
    'Chỉ tính bài tập kiểu OJ. Lượt làm lab và bài trắc nghiệm không nằm trong bảng này.',
  'admin.classes.score-col-student': 'Sinh viên',
  'admin.classes.score-col-attempted': 'Đã thử',
  'admin.classes.score-col-solved': 'Đã giải',
  'admin.classes.score-col-total': 'Tổng điểm',
  'admin.classes.score-col-last': 'Nộp gần nhất',
  'admin.classes.never-submitted': 'Chưa nộp',
  'admin.classes.score-empty-title': 'Chưa có gì để chấm',
  'admin.classes.score-empty-body': 'Thêm sinh viên vào lớp, bảng điểm hiện ngay khi có lượt nộp.',
  // Mỗi bài lấy bản CAO NHẤT, không cộng dồn. Hai cách tính cho hai con số rất
  // khác nhau và người đọc không đoán được là cách nào.
  'admin.classes.score-note': 'Mỗi bài tính điểm cao nhất của người đó, không cộng dồn các lượt nộp lại.',

  // ── /admin/exams ─────────────────────────────────────────────────────────
  'admin.exams.kicker': 'Quản trị · đề, giờ thi, bảng điểm',
  'admin.exams.title': 'Kỳ thi',
  'admin.exams.lead':
    'Mỗi kỳ thi thuộc một lớp. Ra đề bằng mã bài, đặt giờ mở và đóng, rồi theo dõi bảng điểm từng người.',
  'admin.exams.open-create': 'Tạo kỳ thi',
  'admin.exams.col-title': 'Kỳ thi',
  'admin.exams.col-problems': 'Số bài',
  'admin.exams.col-duration': 'Thời lượng',
  'admin.exams.col-window': 'Giờ thi',
  'admin.exams.col-attempts': 'Đã vào làm',
  'admin.exams.col-created': 'Ngày tạo',
  'admin.exams.col-actions': 'Thao tác',
  'admin.exams.open': 'Mở kỳ thi',
  'admin.exams.minutes': (p: { minutes: number }): string => `${String(p.minutes)} phút`,
  'admin.exams.empty-title': 'Chưa có kỳ thi nào',
  'admin.exams.empty-body':
    'Bấm Tạo kỳ thi ở đầu trang. Cần có sẵn một lớp và ít nhất một bài đã xuất bản.',
  'admin.exams.note': (p: { count: number; page: number }): string =>
    `${String(p.count)} kỳ thi ở trang ${String(p.page)}`,
  'admin.exams.note-more': ', còn trang tiếp theo.',
  'admin.exams.created-toast': (p: { title: string }): string => `Đã tạo kỳ thi ${p.title}`,
  'admin.exams.updated-toast': (p: { title: string }): string => `Đã lưu ${p.title}`,
  'admin.exams.removed-toast': (p: { title: string }): string => `Đã xoá kỳ thi ${p.title}`,

  // Trạng thái cửa sổ và câu giờ thi KHÔNG có khoá riêng ở đây: trang quản trị
  // dùng chung `exam.window.*` và `exam.when.*` với màn của sinh viên, để hai
  // bên gọi một kỳ thi bằng cùng một lời.

  // Trang chi tiết
  'admin.exams.detail-title': 'Kỳ thi',
  'admin.exams.back-list': 'Về danh sách kỳ thi',
  'admin.exams.edit': 'Sửa',
  'admin.exams.remove': 'Xoá',
  'admin.exams.info-title': 'Thông tin',
  'admin.exams.field.class': 'Lớp',
  'admin.exams.field.window': 'Giờ thi',
  'admin.exams.field.duration': 'Thời lượng mỗi lượt',
  'admin.exams.field.strategy': 'Cách sinh đề',
  'admin.exams.field.problems': 'Đề bài',
  'admin.exams.field.attempts': 'Đã vào làm',
  'admin.exams.field.created': 'Ngày tạo',
  'admin.exams.attempts': (p: { count: number }): string => `${String(p.count)} lượt`,
  'admin.exams.problems-count': (p: { count: number }): string => `${String(p.count)} bài, theo thứ tự trong đề`,
  'admin.exams.remove-title': (p: { title: string }): string => `Xoá kỳ thi ${p.title}?`,
  'admin.exams.remove-body':
    'Kỳ thi biến khỏi danh sách và khỏi màn làm bài của sinh viên. Việc này ghi vào nhật ký quản trị kèm tên bạn.',
  // `exam_attempts.exam_id` là `onDelete: cascade`: xoá kỳ thi là xoá luôn mọi
  // lượt làm bài. Câu này phải nói ra trước khi bấm, không sau.
  'admin.exams.remove-loss': (p: { count: number }): string =>
    `${String(p.count)} lượt làm bài và toàn bộ điểm của kỳ thi này, không khôi phục được. Tải CSV trước nếu cần giữ điểm.`,
  'admin.exams.remove-loss-none': 'Chưa ai vào làm, nên không mất lượt làm bài hay điểm nào.',
  'admin.exams.remove-confirm': 'Xoá kỳ thi',

  'admin.exams.scoreboard-title': 'Bảng điểm',
  'admin.exams.scoreboard-description':
    'Mỗi bài một cột. Điểm lấy lượt nộp tốt nhất trong giờ thi, nên bài làm trước hôm thi không được tính.',
  'admin.exams.sb-col-name': 'Họ tên',
  'admin.exams.sb-col-started': 'Bắt đầu',
  'admin.exams.sb-col-submitted': 'Nộp lúc',
  'admin.exams.sb-col-auto': 'Tự nộp',
  'admin.exams.sb-col-solved': 'Số bài AC',
  'admin.exams.sb-col-cases': 'Testcase qua',
  'admin.exams.sb-empty-title': 'Chưa ai vào làm',
  'admin.exams.sb-empty-body': 'Bảng điểm hiện khi có người mở lượt thi đầu tiên.',
  'admin.exams.sb-still-working': 'Đang làm',
  'admin.exams.auto-yes': 'Có',
  'admin.exams.auto-no': 'Không',

  'admin.exams.csv-download': 'Tải CSV',
  'admin.exams.csv-done': (p: { file: string }): string => `Đã tải ${p.file}`,
  'admin.exams.csv-note':
    'File kèm BOM UTF-8 nên Excel trên Windows mở không vỡ dấu. Xuất trước khi xoá lớp: xoá lớp là xoá luôn điểm thi của lớp đó.',

  // Cách sinh đề
  'admin.exams.strategy-fixed': 'Một đề chung cho cả lớp',
  'admin.exams.strategy-per-student': 'Mỗi người một đề theo seed riêng',
  'admin.exams.strategy-note':
    'Đề riêng từng người chỉ nhận bài sinh được nhiều biến thể. Bài không đủ điều kiện bị chặn ngay lúc lưu, không để hỏng giữa giờ thi.',

  // ── Form ra đề (tạo và sửa dùng chung) ───────────────────────────────────
  'admin.exams.form.create-title': 'Kỳ thi mới',
  'admin.exams.form.edit-title': (p: { title: string }): string => `Sửa ${p.title}`,
  'admin.exams.form.close': 'Đóng',
  'admin.exams.form.steps-label': 'Các bước ra đề',
  'admin.exams.form.progress': (p: { current: number; total: number }): string =>
    `Bước ${String(p.current)}/${String(p.total)}`,
  'admin.exams.form.step.info': 'Thông tin',
  'admin.exams.form.step.time': 'Thời gian',
  'admin.exams.form.step.problems': 'Đề',
  'admin.exams.form.lead.info': 'Tên hiện trên màn làm bài của sinh viên. Chỉ sinh viên của lớp này vào thi được.',
  'admin.exams.form.lead.time': 'Giờ theo đồng hồ máy bạn.',
  'admin.exams.form.lead.problems': 'Mã bài lấy ở trang Bài tập. Bài phải đã xuất bản.',
  'admin.exams.form.title-label': 'Tên kỳ thi',
  'admin.exams.form.title-placeholder': 'Giữa kỳ DevOps, nhóm thực hành thứ Ba',
  'admin.exams.form.class-label': 'Lớp',
  'admin.exams.form.class-search': 'Tìm lớp theo tên',
  'admin.exams.form.class-loading': 'Đang tải danh sách lớp.',
  'admin.exams.form.class-count': (p: { count: number }): string => `${String(p.count)} lớp`,
  'admin.exams.form.class-none': 'Chưa có lớp nào. Tạo lớp ở trang Lớp học trước.',
  'admin.exams.form.class-no-match': (p: { query: string }): string =>
    `Không lớp nào khớp "${p.query}".`,
  'admin.exams.form.class-truncated': (p: { count: number }): string =>
    `Mới đọc ${String(p.count)} lớp đầu tiên, còn nữa. Gõ tên để thu hẹp, hoặc tạo kỳ thi từ trang của lớp.`,
  'admin.exams.form.class-picked': (p: { name: string }): string => `Đã chọn ${p.name}`,
  'admin.exams.form.class-retry': 'Tải lại danh sách lớp',
  'admin.exams.form.duration-label': 'Thời lượng mỗi lượt (phút)',
  'admin.exams.form.duration-hint': (p: { max: number }): string =>
    `Từ 1 tới ${String(p.max)} phút. Sửa sau chỉ áp cho lượt mở sau đó.`,
  'admin.exams.form.opens-label': 'Mở lúc (không bắt buộc)',
  'admin.exams.form.opens-hint': 'Bỏ trống là mở ngay khi lưu.',
  'admin.exams.form.closes-label': 'Đóng lúc (không bắt buộc)',
  'admin.exams.form.closes-hint': 'Bỏ trống là không có hạn chung, mỗi người vẫn bị tính giờ riêng.',
  'admin.exams.form.problems-label': 'Mã bài, mỗi dòng một mã',
  'admin.exams.form.problems-placeholder': 'K8S-0001\nGIT-0001',
  'admin.exams.form.problems-hint': (p: { count: number; max: number }): string =>
    `${String(p.count)}/${String(p.max)} bài. Thứ tự dòng là thứ tự trong đề.`,
  'admin.exams.form.strategy-label': 'Cách sinh đề',
  'admin.exams.form.strategy-locked': (p: { count: number }): string =>
    `Đã có ${String(p.count)} lượt vào làm nên không đổi được cách sinh đề: nửa lớp sẽ làm một loại đề khác nửa còn lại.`,
  'admin.exams.form.next': 'Tiếp',
  'admin.exams.form.back': 'Quay lại',
  'admin.exams.form.cancel': 'Huỷ',
  'admin.exams.form.submit-create': 'Tạo kỳ thi',
  'admin.exams.form.submit-update': 'Lưu thay đổi',
  'admin.exams.form.step-error': (p: { step: string }): string => `Bước ${p.step} còn chỗ cần sửa.`,
  'admin.exams.form.discard-title': 'Bỏ bản nháp?',
  'admin.exams.form.discard-body': 'Đóng bây giờ thì những gì bạn vừa điền trong form không được giữ lại.',
  'admin.exams.form.discard-confirm': 'Bỏ bản nháp',

  // Lỗi tại ô, nói cách sửa chứ không nói "không hợp lệ".
  'admin.exams.form.error.title': 'Đặt tên cho kỳ thi.',
  'admin.exams.form.error.class': 'Chọn lớp sẽ thi.',
  'admin.exams.form.error.duration': (p: { max: number }): string =>
    `Nhập số phút nguyên, từ 1 tới ${String(p.max)}.`,
  'admin.exams.form.error.date': 'Ngày giờ không đọc được. Chọn lại bằng ô lịch.',
  'admin.exams.form.error.order': 'Giờ đóng phải sau giờ mở, nếu không kỳ thi sẽ không bao giờ mở.',
  'admin.exams.form.error.problems': 'Nhập ít nhất một mã bài.',
  'admin.exams.form.error.problems-max': (p: { max: number }): string =>
    `Một đề tối đa ${String(p.max)} bài. Bớt dòng đi.`,
  'admin.exams.form.error.duplicate': (p: { code: string }): string =>
    `Mã ${p.code} xuất hiện hai lần. Xoá một dòng.`,
  'admin.exams.form.error.code-long': (p: { code: string; max: number }): string =>
    `Mã ${p.code} dài quá ${String(p.max)} ký tự. Chép lại mã từ trang Bài tập.`,

  // ── Lỗi ──────────────────────────────────────────────────────────────────
  'admin.error.users-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được danh sách người dùng: ${p.reason}`,
    next: 'Bấm Tải lại. Vẫn lỗi thì máy chủ đang không đọc được dữ liệu, thử lại sau ít phút.',
  }),
  'admin.error.sessions-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được danh sách phiên: ${p.reason}`,
    next: 'Bấm Tải lại. Vẫn lỗi thì máy chủ phiên đang không trả lời, xem phần sức khoẻ ở trang Tổng quan.',
  }),
  'admin.error.content-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được danh sách nội dung: ${p.reason}`,
    next: 'Bấm Tải lại. Vẫn lỗi thì máy chủ đang không đọc được dữ liệu, thử lại sau ít phút.',
  }),
  'admin.error.audit-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được nhật ký: ${p.reason}`,
    next: 'Bấm Tải lại. Đang ở trang sau thì bấm Về đầu: dòng nhật ký không mất, chỉ là vị trí trang cũ có thể không còn dùng được.',
  }),
  'admin.error.health': (p: { reason: string }): ErrorEntry => ({
    what: `Không đọc được phần sức khoẻ: ${p.reason}`,
    next: 'Bấm Tải lại. Vẫn lỗi thì máy chủ phiên đang không trả lời.',
  }),
  // `FORBIDDEN` là phán quyết có chủ đích của `setUserRole` (tự hạ quyền). Mọi
  // mã khác có thể là mạng chập, nên KHÔNG được nói chắc rằng dữ liệu chưa đổi.
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
    next: 'Tải lại danh sách để xem trạng thái hiện tại trước khi thử lại.',
  }),
  'admin.error.classes-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không đọc được danh sách lớp: ${p.reason}`,
    next: 'Bấm Tải lại. Vẫn lỗi thì máy chủ đang không đọc được dữ liệu, thử lại sau ít phút.',
  }),
  'admin.error.class-get': (p: { reason: string }): ErrorEntry => ({
    what: `Không mở được lớp: ${p.reason}`,
    next: 'Bấm Tải lại, hoặc về danh sách lớp. Lớp có thể vừa bị xoá cùng tài khoản chủ lớp.',
  }),
  // `CONFLICT` là phán quyết có chủ đích của `createClass` (trùng tên).
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
    next: 'Bấm Tải lại. Bảng điểm bên dưới vẫn đọc độc lập với danh sách này.',
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
    next: 'Bấm Tải lại. Danh sách sinh viên bên trên vẫn đọc độc lập với bảng này.',
  }),
  'admin.error.exams-list': (p: { reason: string }): ErrorEntry => ({
    what: `Không đọc được danh sách kỳ thi: ${p.reason}`,
    next: 'Bấm Tải lại. Vẫn lỗi thì máy chủ đang không đọc được dữ liệu, thử lại sau ít phút.',
  }),
  'admin.error.exam-get': (p: { reason: string }): ErrorEntry => ({
    what: `Không mở được kỳ thi: ${p.reason}`,
    next: 'Bấm Tải lại, hoặc về danh sách kỳ thi. Kỳ thi có thể vừa bị xoá, hoặc lớp của nó đã bị xoá.',
  }),
  'admin.error.exam-scoreboard': (p: { reason: string }): ErrorEntry => ({
    what: `Không đọc được bảng điểm kỳ thi: ${p.reason}`,
    next: 'Bấm Tải lại. Thông tin kỳ thi bên trên vẫn đọc độc lập với bảng này.',
  }),
  'admin.error.exam-classes': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được danh sách lớp để chọn: ${p.reason}`,
    next: 'Bấm Tải lại danh sách lớp. Những gì đã điền vẫn còn.',
  }),
  // Lỗi lúc lưu: cổng soạn đề ở máy chủ gộp mọi vấn đề vào một câu (mã không
  // tồn tại, bài chưa xuất bản, bài không seedable), nên câu của nó đủ để sửa.
  'admin.error.exam-save': (p: { message: string }): ErrorEntry => ({
    what: `Máy chủ không lưu kỳ thi: ${p.message}`,
    next: 'Sửa chỗ máy chủ chỉ ra rồi lưu lại. Những gì đã điền vẫn còn.',
  }),
  'admin.error.exam-remove': (p: { message: string }): ErrorEntry => ({
    what: `Máy chủ không xoá kỳ thi: ${p.message}`,
    next: 'Tải lại trang để xem kỳ thi còn không trước khi thử lại.',
  }),
  'admin.error.exam-csv': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được CSV: ${p.reason}`,
    next: 'Bấm Tải CSV lần nữa. Bảng điểm trên trang vẫn đúng.',
  }),
} as const satisfies Surface<'admin'>;

export const adminIntentionalThree = {
  'admin.role':
    '2026-09-10: đúng ba vai trò tồn tại trong pgEnum user_role tại apps/web/src/server/db/schema.ts (user, admin, author), và ViewerRole ở components/shell/nav.ts là union đóng của đúng ba giá trị đó. Vai trò thứ tư nào cũng phải sửa enum DB trước.',
  'admin.content-kind':
    '2026-09-10: đúng ba loại nội dung tồn tại trong CONTENT_KINDS tại packages/shared-types/src/authoring.ts (lesson, lab, playground). Bảng KIND_LABEL là Record<ContentKind, ...> nên loại thứ tư là lỗi biên dịch trước khi là một câu thiếu.',
  'admin.health.metric':
    '2026-09-10: đúng ba giá trị double của IEEE 754 không phải số hữu hạn (NaN, +Infinity, -Infinity), và formatMetricValue phân nhánh đúng ba lần vì Number.isFinite chia miền thành đúng bốn ca. Không phải một phân loại ba, mà là ba ca còn lại sau khi loại số hữu hạn.',
  'admin.exams.form.step':
    '2026-10-03: form ra đề có đúng ba bước theo yêu cầu của chủ dự án (Thông tin, Thời gian, Đề), mỗi bước gom các ô mà composeInput của server kiểm cùng nhau. EXAM_FORM_STEPS trong exam-form-model.ts là mảng const đúng ba phần tử.',
  'admin.exams.form.lead':
    '2026-10-03: mỗi bước của form ra đề có một câu dẫn riêng, nên số câu dẫn bằng đúng số bước của admin.exams.form.step. Thêm bước là thêm cả hai nhóm cùng lúc.',
} as const satisfies IntentionalThree;
