import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `author.`, sở hữu bởi lane 16.G (L6).
 *
 * Phủ vỏ chữ của bốn màn soạn bài: `/author` (danh sách bài của tôi),
 * `/author/new` (tạo bản nháp), `/author/[id]` (sửa, xem trước, tệp đính kèm,
 * xuất bản), cộng bộ nhãn trạng thái dùng chung giữa ba màn đó.
 *
 * ⛔ LUẬT GÕ PHÍM CỦA CẢ GÓI: không U+2014, U+2013, U+2015 ở bất kỳ đâu, kể cả
 * trong chú thích này. Bảy chuỗi cũ trong `app/author/**` mang U+2014 và một
 * chuỗi mang U+2013 (`3-63 ký tự`) đã được viết lại bằng dấu phẩy, dấu chấm,
 * dấu hai chấm, hoặc chữ `tới`. Không thay bằng một ký tự trông giống.
 *
 * ## Ranh giới VỎ so với RUỘT, điểm cắn nhất của lane này
 *
 * Chữ VỎ của trình soạn (nhãn nút, tiêu đề tab, câu giải thích ô nhập, thông
 * báo validate, tên trạng thái) vào bản đồ. Chữ RUỘT mà tác giả tự gõ vào một
 * bài (tiêu đề bài, nội dung bước, câu lệnh chấm) ở lại dạng dữ liệu và không
 * bao giờ đi qua file này. Phép thử của §5.1: số bản sao của chuỗi bị chặn bởi
 * số MÀN HÌNH thì vào bản đồ, bị chặn bởi số MỤC NỘI DUNG thì không.
 *
 * ## Cái KHÔNG ở đây, và vì sao
 *
 * - **`Lưu`, `Huỷ`, `Mở`** ở `common.action.save` / `.cancel` / `.open` (L0 sở
 *   hữu). Chép sang đây là dựng nguồn thứ hai cho cùng một nhãn nút.
 * - **Thông báo lỗi của Zod và của tRPC.** Chúng tới từ server hoặc từ schema
 *   lúc chạy, nên chúng là dữ liệu, không phải mục bản đồ. Thứ ở đây là câu
 *   BAO quanh chúng (tiêu đề hộp lỗi, câu chỉ việc phải làm tiếp).
 * - **Nhóm trường của `app/author/problems`** dùng surface `problem.`. Các
 *   khoá `author.problem.*` đã có vẫn giữ để tương thích với vỏ trình soạn.
 *   `vocabulary.ts` là nhãn giao diện chọn sự cố, nên cũng dùng `problem.`.
 *
 * ## Bộ chọn trả về `CopyRef`, không trả về câu
 *
 * `content-state.ts` và `save-outcome.ts` giữ phần CHỌN nhánh và trả
 * `{ key, params }` theo §1.6, cùng khuôn lane 16.C đã đặt ở
 * `components/catalog/catalog-labels.ts`. Nhờ vậy mọi nhánh của chúng là một
 * mục tĩnh ở đây và bộ dò quét được toàn bộ, thay vì chỉ nhánh mà probe đi vào.
 */
export const author = {
  // ── Tiêu đề tab trình duyệt ───────────────────────────────────────────────
  //
  // Dấu phân cách là U+00B7 chứ không phải một gạch ngang dài, theo tiền lệ
  // `catalog.problem.meta-title` của lane 16.C.
  'author.meta.list': 'Soạn bài · DevOps Learning Platform',
  'author.meta.new': 'Tạo bài mới · DevOps Learning Platform',
  'author.meta.edit': 'Sửa bài · DevOps Learning Platform',

  // ── Điều hướng chung ──────────────────────────────────────────────────────
  'author.nav.back-to-list': 'Về danh sách bài',

  /*
   * ── Loại nội dung ────────────────────────────────────────────────────────
   *
   * Ba giá trị này KHÔNG dịch tự do: chúng là nhãn của `ContentKind`, một union
   * đóng khai ở `packages/shared-types/src/authoring.ts`. Một nhãn thứ tư ở đây
   * mà không có thành viên thứ tư bên đó là một mục chết.
   */
  'author.kind.lesson': 'Bài học',
  'author.kind.lab': 'Lab',
  'author.kind.playground': 'Sân chơi',

  // ── Trạng thái của một bài ────────────────────────────────────────────────
  'author.state.draft': 'Nháp',
  'author.state.publishing': 'Đang xuất bản',
  'author.state.published': 'Đã xuất bản',
  'author.state.archived': 'Lưu trữ',

  /*
   * ── Một dòng mô tả bài ───────────────────────────────────────────────────
   *
   * Ba nhánh vì `stepCount` mang nghĩa khác nhau theo loại: bước của bài học,
   * task của lab, và LUÔN 0 với playground (playground không có thân). Viết
   * "0 bước" cho một playground là đúng số học và sai nghĩa, nên nhánh
   * playground cố ý không nhắc tới con số nào.
   */
  'author.item.desc.lesson': (p: { kind: string; n: number }) => `${p.kind} · ${String(p.n)} bước`,
  'author.item.desc.lab': (p: { kind: string; n: number }) => `${p.kind} · ${String(p.n)} task`,
  'author.item.desc.playground': (p: { kind: string }) => `${p.kind} · không có bước`,

  /*
   * ── Mốc sửa gần nhất ─────────────────────────────────────────────────────
   *
   * Sáu nhánh của MỘT phép chia thời lượng, không phải một phân loại sáu.
   *
   * Mỗi nhánh là một CÂU ĐỦ chứ không phải một mảnh ghép vào một khuôn `Sửa
   * {khi}` ở ngoài, và đó là quyết định do cổng T0 ép ra. Bản đầu tách khuôn
   * ngoài khỏi năm mảnh trong, nên nhánh "chuỗi hỏng" phải là một mục
   * `(p) => p.value`, tức một hàm đồng nhất. T0 bắt đúng nó: một mục chỉ trả
   * lại tham số của chính mình không phải một mục biên tập, nó là dữ liệu máy
   * chủ đi vòng qua bản đồ, và bộ dò không đọc được gì từ nó.
   *
   * Nhánh `on-date` cắt thẳng phần ngày của chuỗi ISO (UTC, đúng thứ BE gửi)
   * chứ không đổi sang giờ địa phương: `toLocaleString` đổi chuỗi theo bản ICU
   * của máy chạy, nên một test pin chuỗi đó xanh ở máy dev và đỏ trên CI.
   *
   * Nhánh `unknown` GIỮ nguyên văn thứ máy chủ gửi, nhưng nói ra rằng nó không
   * đọc được. Vẽ một chuỗi hỏng thành "vừa xong" là bịa; vẽ nó trần trụi thì
   * người đọc tưởng đó là định dạng mốc thời gian của hệ thống.
   */
  'author.item.updated.just-now': 'Sửa vừa xong',
  'author.item.updated.minutes': (p: { n: number }) => `Sửa ${String(p.n)} phút trước`,
  'author.item.updated.hours': (p: { n: number }) => `Sửa ${String(p.n)} giờ trước`,
  'author.item.updated.days': (p: { n: number }) => `Sửa ${String(p.n)} ngày trước`,
  'author.item.updated.on-date': (p: { date: string }) => `Sửa ngày ${p.date}`,
  'author.item.updated.unknown': (p: { value: string }) =>
    `Mốc sửa máy chủ gửi không đọc được: ${p.value}`,

  // ── Trang danh sách ───────────────────────────────────────────────────────
  'author.list.title': 'Soạn bài',
  'author.list.lead':
    'Bài học, lab và sân chơi bạn đang viết. Lưu nháp bao nhiêu lần cũng được; người học chỉ thấy bài sau khi bạn xuất bản.',
  'author.list.kicker': (p: { total: number; drafts: number }) =>
    `Xưởng soạn · ${String(p.total)} bài · ${String(p.drafts)} nháp`,
  'author.list.board-label': 'Bài của bạn, bài sửa gần nhất ở trên',
  'author.list.new-cta': 'Tạo bài mới',
  'author.list.error-title': 'Không tải được danh sách bài',
  'author.list.empty-title': 'Bạn chưa có bài nào',
  'author.list.empty-body':
    'Tạo bài học có từng bước, lab giao việc rồi chấm, hoặc playground là một sandbox trống. Bài mới luôn ở trạng thái Nháp, người học không thấy cho tới khi bạn xuất bản.',
  'author.list.empty-cta': 'Tạo bài đầu tiên',
  'author.list.filter.all': 'Tất cả',
  'author.list.filter.empty.title': (p: { filter: string }) =>
    `Không có bài nào ở trạng thái "${p.filter}"`,
  'author.list.filter.empty.body': 'Chọn bộ lọc khác ở trên để xem các bài còn lại.',
  'author.list.publish-failed': (p: { reason: string }) =>
    `Lần xuất bản gần nhất trượt: ${p.reason}`,

  // ── Trang tạo bài mới ─────────────────────────────────────────────────────
  'author.new.title': 'Tạo bài mới',
  'author.new.after-title': 'Sau khi tạo',
  'author.new.after-body':
    'Bài ra đời ở trạng thái Nháp và chỉ bạn thấy. Xem trước, tệp đính kèm và xuất bản nằm ở trang sửa, mở ngay sau lượt tạo.',
  'author.new.identity-heading': 'Định danh, không sửa lại được',
  'author.new.kind.label': 'Loại nội dung',
  'author.new.kind.hint':
    'Bài học dẫn từng bước · Lab giao việc rồi chấm · Sân chơi là sandbox trống. Không đổi được sau khi tạo.',
  'author.new.id.label': 'Id',
  'author.new.id.placeholder': 'dlp-chan-doan-cpu',
  'author.new.id.hint':
    'Chỉ [a-z0-9-], 3 tới 63 ký tự. Id đi vào bảng tiến độ và điểm của người học nên nó là vĩnh viễn: đổi id sau này sẽ làm tiến độ cũ mồ côi.',
  'author.new.id.invalid': 'id không hợp lệ',
  'author.new.submit': 'Tạo bản nháp',
  'author.new.created.title': 'Đã tạo bản nháp',
  'author.new.created.body': 'Người học chưa thấy bài này cho tới khi bạn xuất bản.',
  'author.new.error.title': 'Không tạo được bài',
  'author.new.error.next':
    'Sửa theo thông báo trên rồi bấm lại. Nếu id đã có người dùng, hãy đổi id.',

  /*
   * ── Bảng ô còn lỗi, dùng chung giữa trang tạo và trang sửa ───────────────
   *
   * `zero` bắt buộc ở tầng kiểu và nó không phải một chỗ điền cho đủ: hộp này
   * chỉ hiện khi có lỗi, nhưng nếu một ngày nào đó nó hiện với 0 thì câu phải
   * nói ra rằng không còn gì để sửa, thay vì "Còn 0 ô cần sửa".
   */
  'author.issues.title': {
    zero: 'Không còn ô nào cần sửa',
    one: 'Còn 1 ô cần sửa',
    many: (n: number) => `Còn ${String(n)} ô cần sửa`,
  },

  // ── Trang sửa bài ─────────────────────────────────────────────────────────
  'author.edit.load-error.title': 'Không tải được bài',
  'author.edit.not-found.title': 'Không có bài đó',
  'author.edit.not-found.body': (p: { id: string }) =>
    `Không tìm thấy "${p.id}" trong danh sách bài của bạn. Có thể id sai, hoặc bài thuộc về tác giả khác.`,
  'author.edit.live-warning.title': 'Bài này đang chạy cho người học',
  'author.edit.live-warning.body': (p: { draftId: string }) =>
    `Lưu sẽ KHÔNG sửa bản đang chạy. Máy chủ tạo một bản nháp kế nhiệm "${p.draftId}"; nội dung của nó chỉ thay thế bản đang chạy khi bạn xuất bản bản nháp đó.`,

  'author.edit.tab.compose': 'Soạn',
  'author.edit.tab.preview': 'Xem trước',
  'author.edit.tab.assets': 'Tệp',
  'author.edit.tab.publish': 'Xuất bản',

  'author.edit.body-error.title': 'Không nạp được nội dung bài',

  'author.edit.preview.error.title': 'Không xem trước được',
  'author.edit.preview.rejected.title': 'Bản nháp chưa qua schema xuất bản',
  'author.edit.preview.rejected.body':
    'Nguồn nội dung từ chối bản nháp này nên không có gì để dựng. Chạy Kiểm tra ở tab Xuất bản để biết field nào còn thiếu.',
  'author.edit.preview.note':
    'Xem trước dựng từ bản ĐÃ LƯU, không từ ô nhập đang gõ. Lưu trước rồi mở lại tab này để thấy thay đổi.',

  'author.edit.archived.title': 'Đã lưu trữ',
  'author.edit.archived.body': 'Bài biến khỏi danh mục người học; tiến độ đã có vẫn còn.',

  /*
   * ── Kết quả một lượt lưu ─────────────────────────────────────────────────
   *
   * Hai nhánh, và nhánh thứ hai là lý do `save-outcome.ts` tồn tại. `update`
   * trên một bài ĐÃ XUẤT BẢN không sửa bài đó: nó tạo một bản nháp kế nhiệm và
   * giữ nguyên từng byte của bản người học đang chạy. Một chữ "Đã lưu" chung
   * cho cả hai nhánh là nói dối bằng cách bỏ bớt.
   */
  'author.save.ok.title': 'Đã lưu bản nháp',
  'author.save.superseded.title': 'Đã tạo bản nháp kế nhiệm, bài đang chạy CHƯA đổi',
  'author.save.superseded.body': (p: { liveId: string; draftId: string }) =>
    `Bài "${p.liveId}" mà người học đang học giữ nguyên. Thay đổi của bạn nằm ở bản nháp "${p.draftId}" và chỉ thay thế bản đang chạy khi bạn bấm Xuất bản.`,

  /*
   * ── Khung chung của Xưởng soạn (2026-10-03, bản dựng lại PTIT) ────────────
   *
   * `components/author/studio/**`: ô trạng thái lưu, hàng tab chế độ, cột kiểm
   * bên phải, nút hành động dùng chung cho trình soạn bài học VÀ trình soạn đề.
   * Một nguồn cho cả hai, để "Lưu trữ" ở trang này và "Lưu trữ" ở trang kia là
   * cùng một chữ, không phải hai chữ tình cờ giống nhau.
   */
  'author.studio.modes.label': 'Chế độ soạn',
  'author.studio.rail.label': 'Bảng kiểm',
  'author.studio.save.new': 'Chưa lưu lần nào',
  'author.studio.save.saved': 'Đã lưu',
  'author.studio.save.unsaved': 'Chưa lưu',
  'author.studio.save.saving': 'Đang lưu',
  'author.studio.save.error': 'Không lưu được',
  'author.studio.rail.issues': 'Ô cần sửa',
  'author.studio.rail.issues-clean': 'Chưa thấy ô nào sai. Máy chủ vẫn kiểm lại lúc lưu và lúc xuất bản.',
  'author.studio.rail.readiness': 'Xuất bản',
  'author.studio.publish.save-first.title': 'Lưu trước khi xuất bản',
  'author.studio.publish.save-first.body':
    'Xuất bản dùng bản đã lưu trên máy chủ, không dùng thứ đang có trên màn hình. Bấm Lưu rồi quay lại đây.',
  'author.studio.action.publish': 'Xuất bản',
  'author.studio.action.archive': 'Lưu trữ',
  'author.studio.action.delete': 'Xoá bài',
  'author.studio.action.save-draft': 'Lưu bản nháp',
  'author.studio.action-error.save': 'Máy chủ từ chối lượt lưu',
  'author.studio.action-error.publish': 'Không xuất bản được',
  'author.studio.action-error.archive': 'Không lưu trữ được',
  'author.studio.action-error.delete': 'Không xoá được',
  'author.studio.list.filter-label': 'Lọc theo trạng thái',
  'author.studio.list.search-label': 'Tìm theo tên hoặc mã',
  'author.studio.list.search-placeholder': 'Tên bài hoặc mã',
  'author.studio.list.loading': 'Đang tải danh sách',
  'author.studio.list.no-match': (p: { query: string }) =>
    `Không có bài nào khớp "${p.query}". Thử từ khác, hoặc xoá ô tìm.`,
  'author.studio.field.unknown': (p: { path: string }) => `Ô ${p.path}`,
  'author.studio.field.step': (p: { n: number }) => `Bước ${String(p.n)}`,
  'author.studio.field.task': (p: { n: number }) => `Task ${String(p.n)}`,
  'author.studio.field.asset': (p: { n: number }) => `Tệp ${String(p.n)}`,
  'author.studio.field.joined': (p: { group: string; field: string }) => `${p.group} · ${p.field}`,

  /*
   * ── Bài tập Kubernetes (OJ), lane 16.G2 ───────────────────────────────────
   *
   * Tiền tố riêng `author.problem.` chứ không dùng chung với `author.state.` /
   * `author.kind.` của phần soạn bài học. Hai miền khác nhau: `ContentState` có
   * bốn giá trị (thêm `publishing`), `ProblemState` có ba, và bảng nhãn của
   * chúng chỉ trùng chữ ở hai mục. Gộp lại là trùng nhầm, và lượt thêm giá trị
   * thứ năm vào một trong hai union sẽ kéo theo cả miền kia.
   *
   * Chữ RUỘT của một bài tập (đề bài, tên mục tiêu, nội dung gợi ý, tham số vị
   * từ) KHÔNG ở đây: chúng là dữ liệu tác giả gõ, chặn bởi số bài chứ không
   * chặn bởi số màn hình.
   */

  'author.problem.meta.list': 'Đề bài · DevOps Learning Platform',
  'author.problem.meta.new': 'Tạo đề mới · DevOps Learning Platform',
  'author.problem.meta.edit': 'Sửa đề · DevOps Learning Platform',

  'author.problem.state.draft': 'Nháp',
  'author.problem.state.published': 'Đã xuất bản',
  'author.problem.state.archived': 'Lưu trữ',
  'author.problem.filter-all': 'Tất cả',

  'author.problem.code-note': 'Mã không đổi kể cả khi bạn sửa đề hay đổi slug.',
  'author.problem.jump-missing': 'Không tìm thấy ô này trên biểu mẫu. Mở chế độ chứa nó rồi tìm theo tên ô.',

  // ── Danh sách bài tập ──────────────────────────────────────────────────────
  'author.problem.list.title': 'Đề bài',
  'author.problem.list.lead':
    'Đề cho bộ chấm của các game: dựng sẵn một trạng thái hỏng, nêu mục tiêu, chấm bằng vị từ. Nháp không hiện với người học, kể cả khi họ có đường dẫn.',
  'author.problem.list.kicker': 'Xưởng soạn · đề bài',
  'author.problem.list.board-label': 'Đề của bạn',
  'author.problem.list.new-cta': 'Tạo đề mới',
  'author.problem.list.error-title': 'Không tải được danh sách đề',
  'author.problem.list.empty-title': 'Bạn chưa soạn đề nào',
  'author.problem.list.empty-filtered': (p: { state: string }) =>
    `Không có đề nào ở trạng thái "${p.state}"`,
  'author.problem.list.empty-body':
    'Một đề không dạy lý thuyết. Nó dựng sẵn một trạng thái hỏng và chấm bằng vị từ có sẵn trong bảng, nên bạn không phải viết dòng logic engine nào.',
  'author.problem.list.empty-cta': 'Tạo đề đầu tiên',
  'author.problem.list.row-topics': (p: { topics: string }) => ` · ${p.topics}`,
  'author.problem.list.row-untried': 'Chưa ai thử.',
  'author.problem.list.row-solved': (p: { solvers: number; attempts: number }) =>
    `${String(p.solvers)}/${String(p.attempts)} người thử đã giải được.`,

  // ── Soạn bài tập mới ───────────────────────────────────────────────────────
  'author.problem.new.title': 'Soạn đề mới',
  'author.problem.new.crumb': 'Đề mới',
  /*
   * `Counted` chứ không phải một câu ghép số: nhánh `zero` bắt buộc ở tầng kiểu,
   * và nó không phải chỗ điền cho đủ. Hộp này chỉ hiện khi `issues.length > 0`,
   * nhưng một lượt refactor làm nó hiện với 0 thì câu phải nói ra rằng không còn
   * gì chặn, thay vì một câu đếm số 0.
   */
  'author.problem.new.issues-title': {
    zero: 'Không còn ô nào chặn lượt lưu',
    one: 'Còn 1 ô chưa lưu được',
    many: (n: number) => `Còn ${String(n)} ô chưa lưu được`,
  },
  'author.problem.new.submit-hint':
    'Máy chủ cấp mã đề lúc bạn lưu lần đầu. Có mã rồi mới xuất bản được, ở trang sửa.',
  'author.problem.new.created-title': (p: { code: string }) => `Đã tạo bản nháp ${p.code}`,
  'author.problem.new.created-body': 'Người học chưa thấy đề này cho tới khi bạn xuất bản.',

  // ── Sửa bài tập ────────────────────────────────────────────────────────────
  // Ô "đã lưu / chưa lưu" nay là `SaveState` dùng chung của Xưởng soạn
  // (`author.studio.save.*`), nên ba khoá trạng thái lưu riêng của đề đã xoá.
  'author.problem.edit.error-title': 'Không mở được đề này',
  'author.problem.edit.error-fallback': 'Không đọc được nội dung đề.',

  // ── Thông báo nổi sau mỗi lượt gọi máy chủ ─────────────────────────────────
  'author.problem.toast.saved': 'Đã lưu',
  'author.problem.toast.published': 'Đã xuất bản',
  'author.problem.toast.published-body': 'Người học thấy bài này ngay bây giờ.',
  'author.problem.toast.archived': 'Đã đưa vào lưu trữ',
  'author.problem.toast.deleted': 'Đã xoá bài',
  'author.problem.toast.json-copied': 'Đã chép JSON vào clipboard',
  'author.problem.toast.imported': 'Đã nhập vào biểu mẫu',
  'author.problem.toast.imported-body': 'Kiểm lại rồi lưu. Lượt nhập không tự lưu.',

  // ── Bảy tab của trình soạn ─────────────────────────────────────────────────
  'author.problem.tab.statement': 'Mô tả',
  'author.problem.tab.cluster': 'Cụm ban đầu',
  'author.problem.tab.objectives': (p: { n: number }) => `Mục tiêu (${String(p.n)})`,
  'author.problem.tab.hints': (p: { n: number }) => `Gợi ý (${String(p.n)})`,
  'author.problem.tab.arena': 'Thử',
  'author.problem.tab.json': 'JSON',
  'author.problem.tab.publish': 'Xuất bản',
  'author.problem.tab.spec': 'Trạng thái ban đầu',

  /*
   * ── Thanh công cụ markdown trong tab Mô tả ─────────────────────────────────
   *
   * Nhóm mới 2026-09-16, nối dây mười chuỗi cứng mà lượt dựng lại giao diện
   * viết thẳng vào `statement-fields.tsx`.
   *
   * Bốn khoá `seed-*` KHÔNG phải bản sao của bốn nhãn nút ngay trên chúng, kể
   * cả khi `heading` và `seed-heading` đang trùng từng chữ. Nhãn nút là chữ
   * TRỢ NĂNG người soạn nghe; `seed-*` là đoạn chữ nút CHÈN vào đề bài khi
   * người soạn chưa bôi đen gì, tức nó thành nội dung bài và người soạn gõ đè
   * lên. Gộp hai vai làm một khoá thì lần đổi chữ trên nút sau này đổi luôn
   * nội dung được chèn, và ngược lại.
   *
   * Vì sao chữ CHÈN vào bài lại nằm ở bản đồ vỏ, ngược với ranh giới VỎ/RUỘT ở
   * đầu file: số bản sao của bốn chuỗi này bị chặn bởi số NÚT trên thanh công
   * cụ, không bởi số bài tác giả soạn. Theo đúng phép thử của §5.1 thì chúng là
   * vỏ, dù đích đến của chúng là một ô nhập.
   */
  'author.problem.markdown.toolbar': 'Định dạng đề bài',
  'author.problem.markdown.badge': 'Markdown',
  'author.problem.markdown.heading': 'Tiêu đề',
  'author.problem.markdown.bold': 'In đậm',
  'author.problem.markdown.list': 'Danh sách',
  'author.problem.markdown.code': 'Đoạn mã',
  'author.problem.markdown.seed-heading': 'Tiêu đề',
  'author.problem.markdown.seed-bold': 'Nội dung',
  'author.problem.markdown.seed-list': 'Yêu cầu',
  'author.problem.markdown.seed-code': 'Lệnh hoặc cấu hình',

  // -- Chon game, va gioi han lưu tru hom nay --------------------------------
  // Ten SAU GameId, khong phai hai game co plugin: GAME_NAME trong
  // game-plugin-view.ts khai Record<GameId, string> toan phan, nen thieu mot
  // khoa o day la mot loi bien dich chu khong phai mot dong trong tren o chon.
  'author.problem.game.name.k8s': 'Kubernetes Arena',
  'author.problem.game.name.git': 'Git Quest',
  'author.problem.game.name.pipeline': 'Pipeline',
  'author.problem.game.name.netpol': 'Network Policy',
  'author.problem.game.name.dockerfile': 'Dockerfile',
  'author.problem.game.name.cicd': 'CI/CD',
  'author.problem.game.label': 'Game',
  'author.problem.game.hint':
    'Chọn game trước. Biểu mẫu trạng thái ban đầu, tập chủ đề và bảng vị từ đều đổi theo game.',
  'author.problem.game.locked':
    'Bài đã lưu thì không đổi game được: đổi game là đổi luôn kiểu của trạng thái ban đầu. Muốn soạn cho game khác thì tạo bài mới.',
  // Hai khoa `not-persistable-*` DA XOA 2026-09-15 cung voi PERSISTABLE_GAMES:
  // chung noi rang bang bai chi giu duoc trang thai ban dau dang cum Kubernetes,
  // va dieu do thoi dung tu khi §18.D.1 nua sau mo problemBodyShape sang da-game.
  'author.problem.game.no-plugin-title': 'Game này chưa có bài tập',
  'author.problem.game.no-plugin-body':
    'Chưa có engine chấm cho game này nên chưa soạn bài cho nó được. Chọn một game khác trong danh sách.',
  'author.problem.game.no-topics':
    'Game đang chọn chưa khai chủ đề nào, nên chưa chọn được chủ đề cho bài.',

  // -- Bieu mau trang thai ban dau dung tu plugin ----------------------------
  'author.problem.spec.no-fields':
    'Plugin của game này chưa mô tả ô nhập nào cho trạng thái ban đầu.',
  'author.problem.spec.line-per-value': 'Mỗi dòng một giá trị.',
  'author.problem.spec.json-hint': 'Nhập JSON. Sai cú pháp thì lượt lưu bị chặn.',
  'author.problem.spec.list-as-json':
    'Danh sách này nhập bằng JSON: một mảng các object. Biểu mẫu lặp có nút thêm, xoá, đổi thứ tự thì chưa dựng cho ô dạng này.',

  'author.problem.spec.unreadable-field': (p: { label: string }) =>
    `Ô "${p.label}" chưa đọc ngược được: kiểm lại cú pháp JSON hoặc giá trị số.`,

  'author.problem.objectives.heading': 'Mục tiêu',
  'author.problem.objectives.add': 'Thêm mục tiêu',
  // §18.D.2: doi thu tu. Nhan ngan tren nut, cau day du trong aria-label kem so
  // thu tu: mot hang nut giong het nhau lap lai N lan la thu trinh doc man hinh
  // doc thanh "nut, nut, nut" ma khong biet dang o muc tieu nao (AC-8).
  'author.problem.objectives.move-up-short': 'Lên',
  'author.problem.objectives.move-down-short': 'Xuống',
  'author.problem.objectives.move-up': (p: { n: number }) =>
    `Đưa mục tiêu ${String(p.n)} lên trên`,
  'author.problem.objectives.move-down': (p: { n: number }) =>
    `Đưa mục tiêu ${String(p.n)} xuống dưới`,
  // §18.B.4: an/hien. Nhan noi HE QUA cho nguoi hoc, khong noi trang thai:
  // "an" mot minh khong noi ra rang nguoi lam VAN dem duoc no trong mau so n/m.
  'author.problem.objectives.visible-on':
    'Hiện: người làm đọc được nhãn này trước khi nộp.',
  'author.problem.objectives.visible-off':
    'Ẩn: người làm biết có testcase này (nó nằm trong mẫu số n/m) nhưng chỉ đọc được nhãn sau khi nộp.',
  'author.problem.objectives.visible-label': 'Cho xem nhãn trước khi nộp',

  // §18.D.6: co seedable. Cau "unavailable" mo ta TINH TRANG THAT: khong plugin
  // nao khai seedSpec, nen hom nay khong game nao sinh de theo seed duoc.
  'author.problem.seedable.label': 'Sinh đề theo seed',
  'author.problem.seedable.available':
    'Bật thì mỗi lượt làm nhận một đề sinh từ seed riêng. Kỳ thi dùng "mỗi sinh viên một đề" chỉ nhận bài đã bật cờ này.',
  'author.problem.seedable.unavailable':
    'Chưa bật được: engine của game này chưa sinh được đề theo seed, nên bật cờ chỉ là một lời hứa không ai thực hiện: mọi sinh viên vẫn nhận cùng một đề. Máy chủ cũng từ chối bài bật cờ này.',

  // ── Tab Thử, mở đấu trường 3D ──────────────────────────────────────────────
  'author.problem.arena.heading': 'Thử trong đấu trường',
  'author.problem.arena.no-code-title': 'Chưa lưu thì chưa thử được',
  'author.problem.arena.no-code-body':
    'Đấu trường nạp bài theo mã, mà mã do máy chủ cấp lúc lưu lần đầu. Lưu bản nháp rồi quay lại đây. Bản nháp không hiện với người học, kể cả khi họ biết URL.',
  'author.problem.arena.lead':
    'Mở cụm bạn vừa soạn trong đấu trường 3D và tự làm thử bài của mình. Đây là cách duy nhất phát hiện một mục tiêu không bao giờ tích xanh trước khi có người học đụng vào nó.',
  'author.problem.arena.stale-title': 'Đấu trường sẽ mở BẢN ĐÃ LƯU',
  'author.problem.arena.stale-body':
    'Bạn đang có thay đổi chưa lưu. Đấu trường nạp bài từ máy chủ theo mã, nên nó không thấy những gì bạn vừa sửa. Lưu trước rồi hãy mở.',
  'author.problem.arena.open': (p: { code: string }) => `Mở đấu trường với bài ${p.code}`,
  'author.problem.arena.no-route-title': 'Game này chưa có đường xem trước',
  'author.problem.arena.no-route-body': (p: { game: string }) =>
    `Đấu trường nhận bài qua tham số truy vấn, và hôm nay chỉ route của Kubernetes đọc tham số đó. Bài ${p.game} vẫn lưu và vẫn xuất bản được; chỉ nút thử tại chỗ là chưa có. Nối được nó đòi một chế độ chơi mới trong game đó, không phải một nút bấm.`,

  // ── Tab JSON, chuyển bài giữa các môi trường ───────────────────────────────
  'author.problem.json.export-heading': 'Xuất',
  'author.problem.json.export-lead':
    'Tải về đúng thứ đang hiện trên màn hình, kể cả phần chưa lưu. Mang sang môi trường khác rồi nhập lại ở ô bên dưới.',
  'author.problem.json.download': 'Tải file JSON',
  'author.problem.json.copy': 'Chép vào clipboard',
  'author.problem.json.export-failed': 'Không xuất được.',
  'author.problem.json.copy-failed': 'Không chép được.',
  'author.problem.json.import-heading': 'Nhập',
  'author.problem.json.import-lead':
    'Dán nội dung file vào đây. Lượt nhập GHI ĐÈ toàn bộ biểu mẫu đang soạn, và không đụng tới bản đã lưu cho tới khi bạn bấm lưu.',
  'author.problem.json.textarea-label': 'JSON bài tập cần nhập',
  'author.problem.json.import': 'Nhập vào biểu mẫu',
  'author.problem.json.import-error-title': 'Không nhập được',
  'author.problem.json.dropped-title': (p: { n: number }) =>
    `Đã nhập, nhưng ${String(p.n)} giá trị bị bỏ`,

  // ── Tab Xuất bản, cổng kiểm trước khi phát hành ────────────────────────────
  'author.problem.publish.heading': 'Xuất bản',
  'author.problem.publish.blocked-title': {
    zero: 'Không còn chỗ nào chặn lượt xuất bản',
    one: 'Còn 1 chỗ phải sửa trước khi xuất bản được',
    many: (n: number) => `Còn ${String(n)} chỗ phải sửa trước khi xuất bản được`,
  },
  'author.problem.publish.ok-title': 'Bài đã đủ điều kiện xuất bản',
  'author.problem.publish.ok-body':
    'Máy chủ kiểm lại một lượt nữa khi bạn bấm. Đó là lớp cuối, và nó gác cùng bộ điều kiện.',
  // e2e luồng CI/CD (`flows/cicd-problem.flow.spec.ts`) tìm ĐÚNG câu này sau khi
  // xuất bản. Cột kiểm nói cùng ý bằng câu khác (`author.problem.rail.live`).
  'author.problem.publish.live-title': 'Bài đang mở cho người học',
  'author.problem.publish.live-body':
    'Người học thấy đề trong danh mục và làm được ngay. Muốn rút đề về thì lưu trữ, lượt nộp cũ vẫn giữ.',
  'author.problem.publish.open': 'Mở chế độ xuất bản',
  'author.problem.publish.danger-heading': 'Xoá hẳn bài',
  'author.problem.publish.danger-body':
    'Chỉ xoá được bài CHƯA có ai nộp. Đã có lượt nộp thì máy chủ từ chối và bảo dùng lưu trữ. Xoá một bài đã có người làm là xoá lịch sử của họ.',

  'author.problem.rail.ready': 'Đủ điều kiện, chờ bạn bấm xuất bản.',
  'author.problem.rail.live': 'Đang mở cho người học.',

  'author.problem.archive.lead':
    'Rút đề khỏi danh mục của người học. Lượt nộp và điểm đã có vẫn giữ, và bạn xuất bản lại được.',
  'author.problem.archive.confirm-title': (p: { code: string }) => `Lưu trữ đề ${p.code}?`,
  'author.problem.archive.confirm-body': 'Đề chuyển sang trạng thái lưu trữ. Bạn vẫn sửa và xuất bản lại được.',
  'author.problem.archive.loss': 'Người học không còn thấy đề trong danh mục. Lượt nộp và điểm đã có không mất.',
  'author.problem.delete.confirm-title': (p: { code: string }) => `Xoá hẳn đề ${p.code}?`,
  'author.problem.delete.loss':
    'Đề bài, trạng thái ban đầu, mục tiêu và gợi ý mất hẳn. Không khôi phục được.',

  /*
   * ── Dịch đường dẫn máy đọc sang câu người soạn đọc ─────────────────────────
   *
   * Bốn khoá PHẲNG chứ không lồng dưới một nhóm `path`: bốn hình dạng đường dẫn
   * hiện có không đóng bởi một union nào, nên một nhóm anh em ở đó là một nhóm
   * sẽ đổi số. Tên phẳng giữ chúng là con trực tiếp của `author.problem`, nhóm
   * đã có nhiều thành viên.
   */
  'author.problem.path-group': (p: { group: string; n: number }) => `${p.group} ${String(p.n)}`,
  'author.problem.path-arg': (p: { group: string; n: number; arg: string }) =>
    `${p.group} ${String(p.n)} › tham số ${p.arg}`,
  'author.problem.path-field': (p: { group: string; n: number; field: string }) =>
    `${p.group} ${String(p.n)} › ${p.field}`,
  'author.problem.path-unknown': (p: { path: string }) => `ô ${p.path}`,

  'author.problem.group.objectives': 'Mục tiêu',
  'author.problem.group.hints': 'Gợi ý',
  'author.problem.group.nodes': 'Node',
  'author.problem.group.resources': 'Tài nguyên',

  // ── Tên từng ô nhập, dùng lại ở danh sách lỗi của cổng xuất bản ────────────
  'author.problem.field.title': 'Tên bài',
  'author.problem.field.slug': 'Slug',
  'author.problem.field.statement': 'Đề bài',
  'author.problem.field.topics': 'Chủ đề',
  'author.problem.field.tags': 'Tag',
  'author.problem.field.time-limit': 'Hạn giờ',
  'author.problem.field.par-moves': 'Số nước đi chuẩn',
  'author.problem.field.allowed-resources': 'Loại tài nguyên cho phép',
  'author.problem.field.namespaces': 'Danh sách namespace',
  'author.problem.field.nodes': 'Node',
  'author.problem.field.objectives': 'Mục tiêu',
  'author.problem.field.hints': 'Gợi ý',
  'author.problem.field.name': 'tên',
  'author.problem.field.namespace': 'namespace',
  'author.problem.field.cpu': 'CPU',
  'author.problem.field.memory': 'bộ nhớ',
  'author.problem.field.spec': 'phần thân JSON',
  'author.problem.field.id': 'định danh',
  'author.problem.field.label': 'nhãn',
  'author.problem.field.check': 'vị từ',
  'author.problem.field.text': 'nội dung',
  'author.problem.field.penalty-points': 'điểm bị trừ',
  'author.asset-directive-fields-khoi-nay-khong-tai-tep-len-no-khai-mot-file':
    'Khối này không tải tệp lên. Mỗi chỉ thị khai một file đã có trong image sandbox và chỗ chép nó tới trong pod. Ảnh để nhúng vào bài thì tải ở tab Tệp.',
  'author.asset-directive-fields-chua-co-chi-thi':
    'Chưa chép file nào vào pod. Bài không cần file riêng thì để trống mục này.',
  'author.asset-directive-fields-chi-thi': 'Chỉ thị',
  'author.asset-directive-fields-host': 'Host',
  'author.asset-directive-fields-host01': 'host01',
  'author.asset-directive-fields-file': 'File',
  'author.asset-directive-fields-start-sh': 'start.sh',
  'author.asset-directive-fields-dich-trong-pod': 'Đích trong pod',
  'author.asset-directive-fields-root': '/root/',
  'author.asset-directive-fields-chmod': 'chmod',
  'author.asset-directive-fields-0755': '0755',
  'author.asset-directive-fields-bo-trong-thi-giu-quyen-mac-dinh':
    'Bỏ trống thì giữ quyền mặc định.',
  'author.asset-directive-fields-them-chi-thi': 'Thêm chỉ thị',
  'author.asset-manager-da-tai-len': 'Đã tải lên',
  'author.asset-manager-dan-doan-markdown-o-bang-duoi-de-nhung': (p: { assetFilename: string }) =>
    `Dán đoạn markdown ở bảng dưới để nhúng ${p.assetFilename}.`,
  'author.asset-manager-da-xoa-tep': 'Đã xoá tệp',
  'author.asset-manager-anh-nhung-trong-noi-dung-bai': 'Ảnh nhúng trong nội dung bài',
  'author.asset-manager-dinh-dang-va-tran': (p: { types: string; max: string }) =>
    `Nhận ${p.types}, tối đa ${p.max} mỗi tệp.`,
  'author.asset-manager-khong-phai-khoi-chep-file-vao-pod':
    'Khác khối "Chép file vào pod" ở tab Soạn: khối đó khai file có sẵn trong image sandbox, còn ở đây là ảnh hiện trong bài.',
  'author.asset-manager-tep-da-tai-len': 'Tệp đã tải lên',
  'author.asset-manager-chon-tep-de-tai-len': 'Chọn tệp để tải lên',
  'author.asset-manager-khong-tai-len-duoc': 'Không tải lên được',
  'author.asset-manager-khong-tai-duoc-danh-sach-tep': 'Không tải được danh sách tệp',
  'author.asset-manager-chua-co-tep-nao': 'Chưa có tệp nào',
  'author.asset-manager-tai-mot-anh-len-roi-dan-doan-markdown-vao-o-noi-dung-cua-buoc-de-nhung-no':
    'Tải một ảnh lên rồi dán đoạn markdown vào ô nội dung của bước để nhúng nó.',
  'author.asset-manager-ten-tep': 'Tên tệp',
  'author.asset-manager-doan-markdown-de-nhung': 'Đoạn markdown để nhúng',
  'author.asset-manager-tai-len': 'Tải lên',
  'author.asset-manager-hanh-dong': 'Hành động',
  'author.asset-manager-trinh-duyet-khong-cho-chep-tu-dong-boi-den-doan-markdown-roi-chep-tay':
    'Trình duyệt không cho chép tự động. Bôi đen đoạn markdown rồi chép tay.',
  'author.asset-manager-da-chep': 'Đã chép',
  'author.asset-manager-chep': 'Chép',
  'author.asset-manager-xoa-that-markdown-con-tham-chieu-tep-nay-se-hien-anh-hong':
    'Xoá thật. Markdown còn tham chiếu tệp này sẽ hiện ảnh hỏng.',
  'author.asset-upload-tep-rong-chon-lai-mot-tep-co-noi-dung': {
    what: 'Tệp rỗng. Chọn lại một tệp có nội dung.',
    next: 'Chọn tệp đúng định dạng và kích thước rồi tải lại.',
  },
  'author.asset-upload-tep-vuot-tran-nen-anh-lai-roi-thu-lai': (p: {
    formatbytesFileSize: string;
    formatbytesMaxContentAssetBytes: string;
  }) => ({
    what: `Tệp ${p.formatbytesFileSize} vượt trần ${p.formatbytesMaxContentAssetBytes}. Nén ảnh lại rồi thử lại.`,
    next: 'Chọn tệp đúng định dạng và kích thước rồi tải lại.',
  }),
  'author.asset-upload-chi-nhan-doi-dinh-dang-roi-thu-lai': (p: {
    contentAssetTypesKeysJoin: string;
  }) => ({
    what: `Chỉ nhận ${p.contentAssetTypesKeysJoin}. Đổi định dạng rồi thử lại.`,
    next: 'Chọn tệp đúng định dạng và kích thước rồi tải lại.',
  }),
  'author.draft-form-view-thong-tin-chung': 'Thông tin chung',
  'author.draft-form-view-thong-tin-chung-ghi-chu':
    'Phần người học đọc ở trang danh mục trước khi mở bài.',
  'author.draft-form-view-sandbox': 'Sandbox',
  'author.draft-form-view-sandbox-ghi-chu':
    'Môi trường mỗi người học nhận khi mở bài. Chọn thừa thì ai mở bài cũng phải chờ dựng phần thừa đó.',
  'author.draft-form-view-noi-dung': 'Nội dung',
  'author.draft-form-view-playground-la-mot-sandbox-trong-khong-co-buoc-khong-co-script-cham-nguoi-ho':
    'Sân chơi là một sandbox trống: không có bước, không có script chấm. Người học nhận đúng môi trường và thời hạn khai ở mục Sandbox.',
  'author.draft-form-view-mo-dau': 'Mở đầu',
  'author.draft-form-view-mo-dau-ghi-chu': 'Phần đọc trước bước đầu tiên. Không bắt buộc.',
  'author.draft-form-view-bai-co-phan-mo-dau': 'Bài có phần mở đầu',
  'author.draft-form-view-cac-buoc': 'Các bước',
  'author.draft-form-view-cac-buoc-ghi-chu':
    'Người học đi theo đúng thứ tự ở đây. Bấm Lên hoặc Xuống để đổi chỗ một bước.',
  'author.draft-form-view-ket-thuc': 'Kết thúc',
  'author.draft-form-view-ket-thuc-ghi-chu': 'Phần hiện sau bước cuối cùng. Không bắt buộc.',
  'author.draft-form-view-bai-co-phan-ket-thuc': 'Bài có phần kết thúc',
  'author.draft-form-view-chuan-bi-moi-truong': 'Chuẩn bị môi trường',
  'author.draft-form-view-chay-mot-lan-khi-dung-lab-lab-co-y-khong-co-setup-theo-tung-task-thu-tu-lam':
    'Chạy một lần khi dựng lab. Lab không có setup theo từng task, vì người học làm task theo thứ tự nào cũng được.',
  'author.draft-form-view-setup-foreground': 'Setup foreground',
  'author.draft-form-view-setup-background': 'Setup background',
  'author.draft-form-view-cac-task': 'Các task',
  'author.draft-form-view-cac-task-ghi-chu':
    'Người học làm task theo thứ tự nào cũng được. Điểm lab tính theo tổng trọng số các task đạt.',
  'author.draft-form-view-chep-file-vao-pod': 'Chép file vào pod',
  'author.draft-form-view-chep-file-vao-pod-ghi-chu':
    'Chép lúc dựng sandbox, cho mọi người học bài này.',
  'author.draft-form-chi-nhan-so-nguyen-duong': {
    what: 'Chỉ nhận số nguyên dương',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'author.draft-form-phai-nam-trong-khoang': (p: { boundsMin: string; boundsMax: string }) => ({
    what: `Giá trị phải nằm trong khoảng ${p.boundsMin} đến ${p.boundsMax}.`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'author.draft-form-tieu-de-khong-duoc-de-trong': {
    what: 'Tiêu đề không được để trống',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'author.draft-form-image-id-khong-duoc-de-trong': {
    what: 'Image id không được để trống',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'author.draft-form-id-task-khong-hop-le': {
    what: 'id task không hợp lệ',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'author.draft-meta-fields-tieu-de': 'Tiêu đề',
  'author.draft-meta-fields-mo-ta': 'Mô tả',
  'author.draft-meta-fields-vi-du-chan-doan-tien-trinh-ngon-cpu':
    'Ví dụ: Chẩn đoán tiến trình ngốn CPU',
  'author.draft-meta-fields-mot-cau-hien-tren-the-o-trang-danh-muc-bo-trong-cung-duoc':
    'Một câu hiện trên thẻ ở trang danh mục. Bỏ trống cũng được.',
  'author.draft-meta-fields-do-kho': 'Độ khó',
  'author.draft-meta-fields-bat-buoc-khi-xuat-ban-schema-bai-hoc-khong-nhan-gia-tri-trong':
    'Chọn độ khó trước khi xuất bản bài học.',
  'author.draft-meta-fields-bat-buoc-khi-xuat-ban-schema-lab-khong-nhan-gia-tri-trong':
    'Chọn độ khó trước khi xuất bản lab.',
  'author.draft-meta-fields-chua-chon': 'Chưa chọn',
  'author.draft-meta-fields-thoi-luong-uoc-tinh-phut': 'Thời lượng ước tính (phút)',
  'author.draft-meta-fields-bo-trong-neu-chua-uoc-tinh-duoc': 'Bỏ trống nếu chưa ước tính được.',
  'author.draft-meta-fields-tier-sandbox': 'Tier sandbox',
  'author.draft-meta-fields-cum-hien-chay-sysbox-hai-tier-con-lai-chua-co-node-nao-phuc-vu':
    'Cụm hiện chạy sysbox; hai tier còn lại chưa có node nào phục vụ.',
  'author.draft-meta-fields-giao-dien': 'Giao diện',
  'author.draft-meta-fields-ide-mo-them-khung-soan-thao-canh-terminal-layout-ide-cua-p6':
    'IDE mở thêm khung soạn thảo cạnh terminal (layout ide của P6).',
  'author.draft-meta-fields-terminal-thuong': 'Terminal thường',
  'author.draft-meta-fields-ide-noi-dung-editor-terminal': 'IDE (nội dung | editor | terminal)',
  'author.draft-meta-fields-bo-cong-cu-them-cho-bai-nay': 'Bộ công cụ thêm cho bài này',
  'author.draft-meta-fields-mac-dinh-khong-bat-gi-sandbox-da-co-san-bo-lenh-thuong-dung-chi-chon-thu-no':
    'Mặc định không bật gì, sandbox đã có sẵn bộ lệnh thường dùng. Chỉ chọn thứ nội dung bài thật sự gõ tới: mỗi công cụ là một lượt cài trong pod lúc mở phiên.',
  'author.draft-meta-fields-backend-image-id': 'Backend image id',
  'author.draft-meta-fields-nguyen-van-imageid-cua-upstream-giu-de-truy-nguyen-no-khong-quyet-dinh-sand':
    'Nguyên văn imageid của upstream. Giữ để truy nguyên; nó KHÔNG quyết định sandbox chạy gì: phần đó do capability bên dưới.',
  'author.draft-meta-fields-capability-sandbox-phai-co': 'Capability sandbox phải có',
  'author.draft-meta-fields-chon-thieu-thi-nguoi-hoc-gap': 'Chọn thiếu thì người học gặp',
  'author.draft-meta-fields-command-not-found': 'command not found',
  'author.draft-meta-fields-giua-bai-chon-thua-thi-bai-chiem-mot-sandbox-nang-hon-muc-can':
    'giữa bài; chọn thừa thì bài chiếm một sandbox nặng hơn mức cần.',
  'author.draft-meta-fields-moc-dat': 'Mốc đạt (%)',
  'author.draft-meta-fields-tinh-theo-tong-trong-so-cac-task-da-dat-bat-buoc-khi-xuat-ban-lab':
    'Tính theo tổng trọng số các task đã đạt. Bắt buộc khi xuất bản lab.',
  'author.draft-meta-fields-bang-xep-hang': 'Bảng xếp hạng',
  'author.draft-meta-fields-bat-cho-lab-nay': 'Bật cho lab này',
  'author.draft-meta-fields-tat-mac-dinh-cua-nen-tang': 'Tắt (mặc định của nền tảng)',
  'author.draft-meta-fields-ttl-phien-giay': 'TTL phiên (giây)',
  'author.draft-meta-fields-300-toi-7200-con-so-nay-hien-cho-nguoi-hoc-truoc-khi-ho-bam-bat-dau-nen-dat':
    '300 tới 7200. Con số này hiện cho người học TRƯỚC khi họ bấm Bắt đầu, nên đặt quá trần là một lời hứa hạ tầng sẽ phá.',
  'author.draft-meta-fields-theo-doi-cpu-ram-va-tien-trinh-theo-thoi-gian-thuc-ban-de-nhin-cua-top':
    'Theo dõi CPU, RAM và tiến trình theo thời gian thực, bản dễ nhìn của top.',
  'author.draft-meta-fields-vi-du-dung-nhanh-cho-mot-lenh-thay-cho-viec-doc-het-trang-man':
    'Ví dụ dùng nhanh cho một lệnh, thay cho việc đọc hết trang man.',
  'author.draft-meta-fields-tim-chuoi-trong-ca-cay-thu-muc-rat-nhanh-lenh-go-la-rg':
    'Tìm chuỗi trong cả cây thư mục, rất nhanh. Lệnh gõ là rg.',
  'author.draft-meta-fields-tim-file-theo-ten-voi-cu-phap-ngan-hon-find-lenh-go-la-fd':
    'Tìm file theo tên với cú pháp ngắn hơn find. Lệnh gõ là fd.',
  'author.draft-meta-fields-xem-dung-luong-dia-con-trong-theo-tung-phan-vung-dang-bang':
    'Xem dung lượng đĩa còn trống theo từng phân vùng, dạng bảng.',
  'author.draft-meta-fields-duyet-thu-muc-theo-dung-luong-de-tim-cho-dang-chiem-dia':
    'Duyệt thư mục theo dung lượng để tìm chỗ đang chiếm đĩa.',
  'author.draft-meta-fields-to-mau-va-canh-cot-cho-git-diff-de-doc-phan-khac-biet-hon':
    'Tô màu và canh cột cho git diff, dễ đọc phần khác biệt hơn.',
  'author.draft-meta-fields-doc-va-sua-yaml-json-tu-dong-lenh-hay-dung-voi-manifest-kubernetes':
    'Đọc và sửa YAML/JSON từ dòng lệnh, hay dùng với manifest Kubernetes.',
  'author.phase-fields-tieu-de-phan': 'Tiêu đề phần',
  'author.phase-fields-bo-trong-cung-duoc-noi-dung-upstream-thuong-khong-co':
    'Bỏ trống cũng được, nội dung upstream thường không có.',
  'author.phase-fields-noi-dung-markdown': 'Nội dung (Markdown)',
  'author.phase-fields-khoi-code-co-the-mang-nut-chay-dung-cu-phap-khoi-code-cua-noi-dung-nen-tang':
    'Khối code có thể mang nút chạy: dùng cú pháp khối code của nội dung nền tảng. Ảnh trỏ tới',
  'author.phase-fields-assets-lt-khoa-gt': './assets/<khoá>',
  'author.phase-fields-lay-khoa-o-tab-tep-dinh-kem': ', khoá lấy ở tab Tệp.',
  'author.phase-fields-chay-bang-bash-hien-trong-terminal-nguoi-hoc':
    'Chạy bằng bash, hiện trong terminal người học.',
  'author.phase-fields-chay-bang-bash-an': 'Chạy bằng bash, ẩn.',
  'author.phase-fields-script-cham': 'Script chấm',
  'author.phase-fields-dat-khi-exit-code-0-bo-trong-nghia-la-phan-nay-khong-cham':
    'Đạt khi exit code = 0. Bỏ trống nghĩa là phần này không chấm.',
  'author.preview-panel-playground-khong-co-noi-dung-de-xem-truoc':
    'Sân chơi không có nội dung để xem trước',
  'author.preview-panel-nguoi-hoc-nhan-dung-mot-sandbox-trong-voi-tier-capability-va-thoi-han-da-kh':
    'Người học nhận đúng một sandbox trống với tier, capability và thời hạn đã khai ở tab Soạn. Không có bước nào, không có script chấm nào.',
  'author.preview-panel-chua-co-gi-de-xem-truoc': 'Chưa có gì để xem trước',
  'author.preview-panel-bai-hoc-chua-co-buoc-nao':
    'Bài học chưa có bước nào, hoặc nguồn nội dung chưa nhận bản nháp. Thêm nội dung ở tab Soạn rồi quay lại đây.',
  'author.preview-panel-lab-chua-co-task-nao':
    'Lab chưa có task nào, hoặc nguồn nội dung chưa nhận bản nháp. Thêm nội dung ở tab Soạn rồi quay lại đây.',
  'author.preview-panel-chon-phan': 'Phần đang xem',
  'author.preview-panel-day-la-chinh-khung-noi-dung-cua-trinh-hoc-nut-chay-tren-khoi-code-bi-vo-hie':
    'Đây là chính khung nội dung người học thấy. Nút chạy trên khối code bị tắt vì xem trước không dựng sandbox, giống trình học lúc người dùng chưa bắt đầu phiên.',
  'author.preview-phases-buoc': (p: { stepIndex1: string }) => `Bước ${p.stepIndex1}`,
  // Cột kiểm của `/author/[id]`: ba điều kiện trước khi người học thấy bài.
  'author.rail.saved.ok': 'Màn hình khớp bản đã lưu',
  'author.rail.saved.todo': 'Còn thay đổi chưa lưu',
  'author.rail.check-clean': 'Kiểm tra định dạng: sạch',
  'author.rail.check-blocked': 'Kiểm tra định dạng: còn lỗi chặn',
  'author.rail.check-never': 'Chưa chạy Kiểm tra trên bản đã lưu',
  'author.rail.open-publish': 'Mở chế độ Xuất bản',
  'author.rail.trial.idle': 'Chưa chạy thử lần nào',
  'author.rail.trial.running': 'Đang chạy thử trong sandbox',
  'author.rail.trial.passed': 'Lượt chạy thử gần nhất đạt',
  'author.rail.trial.failed': 'Lượt chạy thử gần nhất trượt',
  'author.publish.section.check': 'Kiểm tra trước',
  'author.publish.section.run': 'Chạy thử rồi xuất bản',
  'author.publish.section.trial': 'Kết quả chạy thử',
  'author.publish.section.archive': 'Lưu trữ',
  'author.publish.passed': 'Đã xuất bản',
  'author.publish.check.blocked': 'Lỗi định dạng dưới đây chặn xuất bản. Bấm vào một dòng để tới ô cần sửa.',
  'author.publish.archive-loss':
    'Người học không mở được bài này nữa và bài biến khỏi danh mục. Tiến độ và điểm đã có vẫn giữ nguyên.',
  'author.publish-panel-kiem-tra-khong-doi-trang-thai-bai-va-khong-ton-sandbox-nao-no-chay-dung-sch':
    'Kiểm tra các trường của bài và cảnh báo shellcheck cho từng script. Bài vẫn ở trạng thái hiện tại và chưa tạo sandbox.',
  'author.publish-panel-kiem-tra': 'Kiểm tra',
  'author.publish-panel-xuat-ban-dung-mot-sandbox-that-va-chay-lan-luot-moi-script-cua-bai-viec-nay':
    'Xuất bản dựng sandbox và chạy lần lượt các script của bài. Việc này có thể mất vài phút. Bạn có thể đóng tab rồi quay lại xem kết quả.',
  'author.publish-panel-nut-xuat-ban-dang-tat-vi-luot-kiem-tra-con-loi-dinh-dang-o-tren-sua-roi-kie':
    'Nút Xuất bản đang tắt vì lượt kiểm tra còn lỗi định dạng ở trên. Sửa rồi kiểm tra lại.',
  'author.publish-panel-luu-tru-bai-nay': 'Lưu trữ bài này?',
  'author.publish-panel-bai-se-bien-khoi-danh-muc-nguoi-hoc-tien-do-va-diem-da-co-khong-bi-xoa-nen':
    'Bài sẽ được ẩn khỏi danh mục người học. Tiến độ và điểm đã có được giữ lại.',
  'author.publish-panel-dinh-dang-hop-le': 'Định dạng hợp lệ',
  'author.publish-panel-bai-qua-dung-schema-ma-luot-xuat-ban-se-dung':
    'Các trường của bài đã đủ điều kiện để chạy thử khi xuất bản.',
  'author.publish-panel-shellcheck': 'Shellcheck:',
  'author.publish-panel-canh-bao-shellcheck-khong-bao-gio-chan-xuat-ban':
    'Cảnh báo shellcheck không bao giờ chặn xuất bản.',
  'author.publish-panel-dong': 'dòng',
  'author.publish-panel-dang-gui-yeu-cau-xuat-ban': 'Đang gửi yêu cầu xuất bản…',
  'author.publish-panel-dang-chay-thu-trong-sandbox': 'Đang chạy thử trong sandbox',
  'author.publish-panel-trang-dang-hoi-lai-may-chu-vai-giay-mot-lan-may-chu-khong-bao-dang-chay-toi':
    'Trang đang hỏi lại máy chủ vài giây một lần. Máy chủ KHÔNG báo đang chạy tới bước nào, chỉ có kết quả cuối, nên bảng dưới còn trống cho tới lúc đó.',
  'author.publish-panel-bai-da-len-va-nguoi-hoc-thay-duoc': 'Bài đã lên và người học thấy được.',
  'author.publish-panel-ban-nhap-da-thay-the-bai-dang-chay-va-tu-bien-mat-tu-gio-hay-sua-tren-id-do':
    (p: { phasePromotedto: string }) =>
      `Bản nháp đã thay thế bài đang chạy "${p.phasePromotedto}" và tự biến mất. Từ giờ hãy sửa trên id đó.`,
  'author.publish-panel-luot-chay-thu-truot-bai-quay-ve-nhap':
    'Lượt chạy thử trượt, bài quay về Nháp',
  'author.publish-panel-chi-tiet-o-bang-duoi-sua-cho-duoc-neu-roi-xuat-ban-lai':
    'Chi tiết ở bảng dưới. Sửa chỗ được nêu rồi xuất bản lại.',
  'author.publish-panel-khong-con-dau-vet-cua-luot-chay-thu': 'Không còn dấu vết của lượt chạy thử',
  'author.publish-panel-bai-quay-ve-nhap-ma-may-chu-khong-ghi-lai-ly-do-nao-thuong-la-tien-trinh-ch':
    'Bài quay về Nháp mà máy chủ không ghi lại lý do nào. Thường là tiến trình chạy thử bị mất giữa chừng (pod web khởi động lại), hoặc lượt chạy đã quá hạn treo. Bấm Xuất bản lại; nếu lặp lại nhiều lần thì báo người vận hành.',
  'author.publish-panel-bai-nay-khong-co-script-nao-luot-chay-thu-cua-no-la-chinh-viec-sandbox-dung':
    'Bài này không có script nào. Lượt chạy thử của nó là chính việc sandbox dựng lên được với tier và capability đã khai.',
  'author.publish-panel-chua-chay-lan-nao-day-la-nhung-gi-luot-xuat-ban-se-chay-dung-thu-tu':
    'Chưa chạy lần nào. Đây là những gì lượt xuất bản sẽ chạy, đúng thứ tự:',
  'author.publish-panel-dang-chay-may-chu-khong-phat-tien-do-tung-buoc-nen-moi-dong-duoi-day-con-o':
    'Đang chạy. Máy chủ không phát tiến độ từng bước, nên mọi dòng dưới đây còn ở "Đang chờ" cho tới khi có kết quả cuối: đó là thứ ta biết, không phải thứ đang xảy ra.',
  'author.publish-panel-khong-khop-duoc-loi-voi-buoc-nao-cua-bai':
    'Không khớp được lỗi với bước nào của bài',
  'author.publish-panel-noi-dung-bai-co-the-da-doi-sau-luot-xuat-ban-do-day-la-nguyen-van-loi-may-c':
    'Nội dung bài có thể đã đổi sau lượt xuất bản đó. Đây là nguyên văn lỗi máy chủ ghi lại:',
  'author.publish-panel-output-cua': 'Output của',
  'author.publish-panel-exit': '(exit',
  'author.publish-panel-truot-truoc-khi-chay-duoc-buoc-nao': 'Trượt trước khi chạy được bước nào',
  'author.script-warning-chua-kiem-duoc': 'Chưa kiểm được',
  'author.script-warning-khong-ro-ly-do-day-khong-phai-script-sach-chua-co-luot-kiem-nao-chay':
    'Không rõ lý do. Đây KHÔNG phải "script sạch", chưa có lượt kiểm nào chạy.',
  'author.script-warning-day-khong-phai-script-sach-chua-co-luot-kiem-nao-chay': (p: {
    reportUnavailablereason: string;
  }) => `${p.reportUnavailablereason}. Đây KHÔNG phải "script sạch", chưa có lượt kiểm nào chạy.`,
  'author.script-warning-khong-co-canh-bao': 'Không có cảnh báo',
  'author.script-warning-canh-bao': (p: { reportFindingsLength: string }) =>
    `${p.reportFindingsLength} cảnh báo`,
  'author.script-warning-canh-bao-khong-chan-xuat-ban-script-van-co-the-chay-dung':
    'Cảnh báo KHÔNG chặn xuất bản, script vẫn có thể chạy đúng.',
  'author.script-warning-bai-nay-khong-co-script-nao-de-kiem':
    'Bài này không có script nào để kiểm',
  'author.script-warning-script-chua-kiem-duoc-khong-ket-luan-la-sach': (p: {
    unknown: string;
    scriptcount: string;
  }) => `${p.unknown}/${p.scriptcount} script CHƯA kiểm được, không kết luận là sạch`,
  'author.script-warning-canh-bao-tren-script': (p: {
    findings: string;
    warningsLength: string;
    scriptcount: string;
  }) => `${p.findings} cảnh báo trên ${p.warningsLength}/${p.scriptcount} script`,
  'author.script-warning-script-khong-co-canh-bao-nao': (p: { scriptcount: string }) =>
    `${p.scriptcount} script, không có cảnh báo nào`,
  'author.step-list-fields-chua-co-buoc-nao':
    'Bài chưa có bước nào. Cần ít nhất một bước thì mới xuất bản được.',
  'author.step-list-fields-chua-co-task-nao':
    'Lab chưa có task nào. Cần ít nhất một task thì mới xuất bản được.',
  'author.step-list-fields-chua-dat-ten': 'Chưa đặt tên',
  'author.step-list-fields-buoc': 'Bước',
  'author.step-list-fields-len': 'Lên',
  'author.step-list-fields-xuong': 'Xuống',
  'author.step-list-fields-id-task': 'Id task',
  'author.step-list-fields-tim-tien-trinh-ngon-cpu': 'tim-tien-trinh-ngon-cpu',
  'author.step-list-fields-chi-a-z0-9-dinh-danh-ben-doi-sau-khi-co-nguoi-lam-bai-se-lam-ket-qua-cu-gan':
    'Chỉ [a-z0-9-]. Định danh BỀN: đổi sau khi có người làm bài sẽ làm kết quả cũ gắn sai task.',
  'author.step-list-fields-bat-buoc-khi-xuat-ban-lab': 'Bắt buộc khi xuất bản lab.',
  'author.step-list-fields-bo-trong-cung-duoc': 'Bỏ trống cũng được.',
  'author.step-list-fields-bat-buoc-mot-task-khong-cham-duoc-thi-luon-o-trang-thai-chua-dat-dat-khi-ex':
    'Bắt buộc: một task không chấm được thì luôn ở trạng thái chưa đạt. Đạt khi exit code = 0.',
  'author.step-list-fields-bo-trong-nghia-la-buoc-nay-chi-dan-giai-khong-cham-dat-khi-exit-code-0':
    'Bỏ trống nghĩa là bước này chỉ dẫn giải, không chấm. Đạt khi exit code = 0.',
  'author.step-list-fields-trong-so': 'Trọng số',
  'author.step-list-fields-bo-trong-thi-loader-ap-1-moi-task-nang-nhu-nhau':
    'Bỏ trống thì tính là 1, mọi task nặng như nhau.',
  'author.step-list-fields-goi-y': 'Gợi ý',
  'author.step-list-fields-them-buoc': 'Thêm bước',
  'author.step-list-fields-them-task': 'Thêm task',
  'author.trial-plan-setup-chay-an': (p: { human: string }) => `${p.human}, setup chạy ẩn`,
  'author.trial-plan-setup-hien-trong-terminal': (p: { human: string }) =>
    `${p.human}, setup hiện trong terminal`,
  'author.trial-plan-script-cham-phai-dat': (p: { human: string }) =>
    `${p.human}, script chấm (phải đạt)`,
  'author.trial-plan-task-script-cham-chi-can-chay-duoc': (p: { taskTitle: string }) =>
    `Task "${p.taskTitle}", script chấm (chỉ cần chạy được)`,
  'author.trial-plan-noi-dung-khong-hop-le': 'Nội dung không hợp lệ:',
  'author.trial-plan-dat': 'Đạt',
  'author.trial-plan-da-chay': 'Đã chạy',
  'author.trial-plan-truot': 'Trượt',
  'author.trial-plan-chua-chay': 'Chưa chạy',
  'author.trial-plan-dang-cho': 'Đang chờ',
  'author.step-task': 'Task',

  /*
   * ── Level Builder của game Git, §18.E ────────────────────────────────────
   *
   * Từ đợt dựng lại giao diện PTIT (2026-10-03), MỌI chữ của màn Builder đi
   * qua khối này: vỏ màn (tên bước, nhãn ô, nút, câu chỉ dẫn) lẫn bản dịch của
   * hai union đóng bên `packages/games` (16 mã `DraftIssueCode`, 2 phần tử
   * `BUILDER_CANNOT_EXPRESS`). Trước đó vỏ màn viết thẳng trong
   * `components/games/git/builder/**`, nên một màn hình đọc chữ từ hai nguồn
   * và người sửa chữ phải đoán mình đang sửa loại nào.
   *
   * Hai union đóng vẫn đi qua các bảng `satisfies Record<..., TextKey>` ở
   * `builder-copy.ts`: thêm mã thứ 17 mà quên câu cho nó là lỗi biên dịch,
   * không phải một dòng trống trên màn. Độ khó của level đọc
   * `common.difficulty.*` qua cùng kiểu bảng đó, không khai lại ở đây.
   *
   * `detail` của một issue (mã mục tiêu, tên vị từ, tên lệnh) KHÔNG đi qua đây.
   * Nó là thứ người soạn tự gõ, và §"Ranh giới VỎ so với RUỘT" ở đầu file đã
   * chốt phép thử: chặn bởi số MÀN HÌNH thì vào bản đồ, chặn bởi số MỤC NỘI
   * DUNG thì không. Giao diện in nó trong một thẻ `code` cạnh câu.
   */
  'author.builder.intro.kicker': 'Trước khi soạn',
  'author.builder.intro.title': 'Hai loại level Builder chưa dựng được',

  'author.builder.step.capture': 'Chụp trạng thái',
  'author.builder.step.brief': 'Đề bài',
  'author.builder.step.rules': 'Luật chơi và chấm điểm',
  'author.builder.step.objectives': 'Mục tiêu',
  'author.builder.step.solution': 'Lời giải mẫu',
  'author.builder.step.hints': 'Gợi ý',
  'author.builder.step.teaching': 'Tầng dạy học',
  'author.builder.step.check': 'Kiểm bản nháp',
  'author.builder.step.play': 'Chơi thử',
  'author.builder.step.transfer': 'Xuất và nhập',
  'author.builder.step.save': 'Lưu vào kho bài tập',

  'author.builder.lead.capture':
    'Dựng cây bằng lệnh git ở ô lệnh của sandbox, rồi chụp nó làm trạng thái đầu hoặc làm cây đích.',
  'author.builder.lead.objectives':
    'Mỗi mục tiêu là một testcase. Level cần ít nhất một mục bắt buộc, không thì verdict đạt không bao giờ tới.',
  'author.builder.lead.teaching':
    'Màn chơi Git hiện chưa hiển thị phần này. Nó đi theo tệp level bạn xuất ra, để dùng được ngay khi màn chơi có chỗ hiện nó. Bài lý thuyết chọn ở phần đề bài thì hiện được ngay.',
  'author.builder.lead.play':
    'Mở level này bằng đúng màn chơi người chơi sẽ thấy. Trong đó có thêm nút chạy lời giải mẫu để xem từng lệnh đi qua.',
  'author.builder.lead.transfer':
    'Phần này chạy hẳn trong trình duyệt: xuất bản nháp ra một chuỗi JSON, hoặc dán một chuỗi đã xuất để soạn tiếp.',

  'author.builder.capture.set-setup': 'Đặt làm trạng thái đầu',
  'author.builder.capture.set-target': 'Đặt làm đích',
  'author.builder.capture.clear-target': 'Xoá đích',
  'author.builder.capture.setup': 'Trạng thái đầu',
  'author.builder.capture.target': 'Cây đích',
  'author.builder.capture.unit': 'commit',
  'author.builder.capture.unset': 'Chưa đặt',

  'author.builder.label.id': 'Mã level',
  'author.builder.label.title': 'Tiêu đề',
  'author.builder.label.mission': 'Nhiệm vụ',
  'author.builder.label.brief': 'Đề bài đầy đủ',
  'author.builder.label.chapter': 'Chương',
  'author.builder.label.difficulty': 'Độ khó',
  'author.builder.label.theory': 'Bài lý thuyết đi kèm',
  'author.builder.label.allowed': 'Tập lệnh cho phép',
  'author.builder.label.par': 'Số lệnh chuẩn',
  'author.builder.label.solution': 'Chuỗi lệnh lời giải',
  'author.builder.label.alt-solution': 'Lời giải thứ hai',
  'author.builder.label.hints': 'Danh sách gợi ý',
  'author.builder.label.primer': 'Bài dẫn trước khi chơi',
  'author.builder.label.takeaways': 'Đúc kết sau khi thắng',

  'author.builder.hint.id': (p: { prefix: string }) =>
    `Mở đầu bằng ${p.prefix}, rồi tới slug thường không dấu ngăn bằng gạch nối.`,
  'author.builder.hint.mission': 'Một câu. Đây là dòng chữ duy nhất luôn hiện trên màn chơi.',
  'author.builder.hint.brief': 'Bối cảnh và việc cần làm. Không nói cách làm.',
  'author.builder.hint.theory': (p: { n: number }) =>
    `Chọn một trong ${String(p.n)} bài đã có, hoặc để trống. Builder không tạo bài lý thuyết mới, vì chúng là tệp markdown trong kho chứ không phải dữ liệu của level.`,
  'author.builder.hint.allowed':
    'Mỗi dòng một động từ git, ví dụ status hoặc log. Để trắng nghĩa là cho dùng mọi lệnh.',
  'author.builder.hint.par':
    'Dùng để chấm điểm, không dùng để chặn. Người chơi gõ nhiều lệnh hơn vẫn qua bài.',
  'author.builder.hint.solution': 'Mỗi dòng một lệnh. Nút kiểm ở bước sau chạy đúng chuỗi này.',
  'author.builder.hint.alt-solution':
    'Khác đường đi, không chỉ đảo thứ tự hai lệnh độc lập. Đây là bằng chứng level chấm theo trạng thái chứ không theo lệnh đã gõ.',
  'author.builder.hint.hints':
    'Mỗi dòng một gợi ý, mở theo thứ tự từ trên xuống. Gợi ý sau phải cụ thể hơn gợi ý trước.',
  'author.builder.hint.primer': 'Markdown, tối đa 250 từ. Không phải lời giải.',
  'author.builder.hint.takeaways': 'Mỗi dòng một ý, mỗi ý một câu.',

  'author.builder.option.chapter-1': '1 · Nắn lịch sử',
  'author.builder.option.chapter-2': '2 · Làm việc nhóm',
  'author.builder.option.chapter-3': '3 · Cứu hộ',
  'author.builder.option.no-theory': 'Không kèm bài đọc',

  'author.builder.objective.legend': (p: { n: number }) => `Mục tiêu ${String(p.n)}`,
  'author.builder.objective.id': 'Mã mục tiêu',
  'author.builder.objective.label': 'Câu mô tả',
  'author.builder.objective.check': 'Vị từ chấm',
  'author.builder.objective.required': 'Bắt buộc. Bỏ chọn thì đây là mục thưởng.',
  'author.builder.objective.remove': (p: { n: number }) => `Xoá mục tiêu ${String(p.n)}`,
  'author.builder.objective.add': 'Thêm mục tiêu',
  'author.builder.objective.no-args': 'Vị từ này không nhận tham số.',
  'author.builder.objective.no-args-graph':
    'Vị từ này không nhận tham số. Nó so hình dạng DAG với cây đích ở bước chụp trạng thái, nên cần đặt đích trước.',
  'author.builder.objective.lines': 'Mỗi dòng là một dòng nội dung của file.',
  'author.builder.objective.missing': (p: { names: string }) =>
    `Còn trống tham số bắt buộc: ${p.names}. Thiếu chúng thì vị từ trả "chưa đạt" ở mọi trạng thái, và engine không nói lý do.`,

  'author.builder.cheat.title': 'Mục tra nhanh',
  'author.builder.cheat.legend': (p: { n: number }) => `Mục ${String(p.n)}`,
  'author.builder.cheat.command': 'Lệnh',
  'author.builder.cheat.explain': 'Giải thích',
  'author.builder.cheat.remove': (p: { n: number }) => `Xoá mục ${String(p.n)}`,
  'author.builder.cheat.add': 'Thêm mục tra nhanh',
  'author.builder.cheat.empty': 'Chưa có mục nào. Mỗi mục là một lệnh kèm một câu giải thích.',

  'author.builder.issues.ready': 'Bản nháp đã đủ để xuất thành level.',
  'author.builder.issues.title': 'Bản nháp còn thiếu',

  'author.builder.play.run': 'Chơi thử level này',

  'author.builder.transfer.export': 'Chuỗi JSON của level',
  'author.builder.transfer.export-empty':
    'Bản nháp còn lỗi nên chưa xuất được. Xem danh sách ở bước kiểm bản nháp.',
  'author.builder.transfer.download': 'Tải tệp JSON',
  'author.builder.transfer.import': 'Dán chuỗi JSON đã xuất',
  'author.builder.transfer.import-run': 'Nhập level',
  'author.builder.transfer.import-error':
    'Không đọc được chuỗi này. Nó phải là bản xuất level của chính Builder, và nội dung phải qua hết các phép kiểm ở bước kiểm bản nháp.',

  'author.builder.issue.id-trong': 'Chưa đặt mã level.',
  'author.builder.issue.id-sai-dinh-dang':
    'Mã level sai định dạng. Nó phải mở đầu bằng tiền tố dành riêng cho level tự dựng, rồi tới slug thường không dấu ngăn bằng gạch nối. Tiền tố đó là thứ giữ cho tiến độ đã lưu của 32 level phát hành không bị ghi đè.',
  'author.builder.issue.tieu-de-trong': 'Chưa đặt tiêu đề.',
  'author.builder.issue.nhiem-vu-trong':
    'Chưa viết câu nhiệm vụ. Đây là dòng chữ thường trực duy nhất trên màn chơi.',
  'author.builder.issue.de-bai-trong': 'Chưa viết đề bài.',
  'author.builder.issue.khong-co-muc-tieu':
    'Level chưa có mục tiêu nào. Một mục tiêu là một testcase.',
  'author.builder.issue.khong-co-muc-tieu-bat-buoc':
    'Mọi mục tiêu đều là mục thưởng, nên không còn gì chặn người chơi. Level này sẽ không bao giờ ra verdict đạt.',
  'author.builder.issue.muc-tieu-trung-id': 'Hai mục tiêu đang mang cùng một mã.',
  'author.builder.issue.vi-tu-khong-ton-tai': 'Vị từ chấm này không có trong engine.',
  'author.builder.issue.thieu-cay-dich':
    'Mục tiêu này so hình dạng DAG với cây đích, mà ô cây đích đang trống. Dựng trạng thái bạn muốn tới rồi bấm nút đặt làm đích.',
  'author.builder.issue.khong-co-loi-giai':
    'Chưa khai lời giải mẫu. Thiếu nó thì câu "level này qua được" là một lời khai, không phải một phép đo.',
  'author.builder.issue.tap-lenh-rong':
    'Tập lệnh cho phép đang rỗng, và rỗng nghĩa là CẤM mọi lệnh. Muốn cho dùng mọi lệnh thì để trắng ô này.',
  'author.builder.issue.loi-giai-dung-lenh-ngoai-tap':
    'Lời giải mẫu gọi một lệnh nằm ngoài tập lệnh cho phép. Level đang tự chặn lời giải của chính nó.',
  'author.builder.issue.par-am': 'Số lệnh chuẩn không nhận giá trị âm.',
  'author.builder.issue.trang-thai-dau-hong':
    'Trạng thái đầu không dựng được. Thường là một nhánh trỏ vào commit chưa định nghĩa.',
  'author.builder.issue.cay-dich-hong':
    'Cây đích không dựng được. Thường là một nhánh trỏ vào commit chưa định nghĩa.',

  'author.builder.limit.bot-dong-doi':
    'Đồng đội tự động. Một level cần bot đẩy commit lên origin theo lượt phải soạn tay trong tệp TS, vì mỗi hành động của bot là một dòng lịch trình chứ không phải một trạng thái chụp lại được.',
  'author.builder.limit.nhieu-luot-chay-co-seed':
    'Level đổi theo seed. Builder chụp đúng MỘT thế giới, nên một level muốn mỗi người chơi nhận một cây khác nhau vẫn phải soạn tay.',

  /*
   * ── E.7, và phạm vi của nó ───────────────────────────────────────────────
   *
   * `author.builder.check.scope` là câu mà `phase-18.md` §18.E dặn phải hiện
   * TRÊN MÀN chứ không giấu trong tài liệu. Nó ở đây, cạnh nhãn nút, để không ai
   * đổi nhãn mà bỏ quên nó.
   */
  'author.builder.check.run': 'Kiểm lời giải mẫu',
  'author.builder.check.scope':
    'Phép này chạy chuỗi lời giải mẫu bạn vừa khai rồi hỏi nó có đạt hết mục tiêu bắt buộc không. Nó KHÔNG trả lời câu "level này có giải được không": tên nhánh, lời nhắn và đường dẫn đều là tham số tự do nên không gian lệnh git là vô hạn, và không phép dò nào duyệt hết được.',
  'author.builder.check.pass': (p: { passed: number; total: number }) =>
    `Lời giải mẫu đạt ${String(p.passed)}/${String(p.total)} mục tiêu bắt buộc.`,
  'author.builder.check.fail': (p: { passed: number; total: number }) =>
    `Lời giải mẫu mới đạt ${String(p.passed)}/${String(p.total)} mục tiêu bắt buộc.`,
  'author.builder.check.unmet': 'Mục tiêu bắt buộc chưa đạt sau khi chạy hết chuỗi lệnh:',
  'author.builder.check.rejected':
    'Engine từ chối những lệnh dưới đây. Một lời giải gõ nhầm một lệnh rồi gõ lại đúng vẫn tới được đích, nên đây là thông tin cho người soạn chứ không phải điều kiện trượt.',
  'author.builder.check.blocked':
    'Chưa kiểm được: bản nháp còn lỗi ở danh sách trên. Sửa hết rồi bấm lại.',

  /*
   * ── E.5, đường xuất THỨ HAI của Builder ───────────────────────
   *
   * `author.builder.save.scope` nói ra hai thứ mà không chỗ nào khác trên màn nói:
   * nút này là lời gọi mạng DUY NHẤT của cả trụ cột game, và nó đòi tài khoản
   * soạn bài. Giấu hai điều đó là để người soạn soạn xong rồi mới biết mình
   * không lưu được, cùng lý lẽ với hai giới hạn ở khối đầu.
   */
  'author.builder.save.run': 'Lưu thành bài tập',
  'author.builder.save.scope':
    'Lưu bản nháp này thành một bài tập trong kho, ở trạng thái nháp. Đây là lời gọi máy chủ duy nhất trong cả màn game, nên nó đòi bạn đang đăng nhập bằng tài khoản soạn bài. Các ô dưới đây chỉ có nghĩa với bài tập, nên tệp level bạn xuất ra không chở chúng.',
  'author.builder.save.saving': 'Đang lưu bài tập',
  'author.builder.save.topics': 'Chủ đề, chọn từ một tới ba',
  'author.builder.save.tags': 'Tag',
  'author.builder.save.tags-hint':
    'Phân loại tự do, ngăn bằng dấu phẩy. Dấu tiếng Việt được bỏ và khoảng trắng thành gạch nối.',
  'author.builder.save.penalties': 'Điểm trừ mỗi gợi ý',
  'author.builder.save.penalties-hint':
    'Gợi ý của level miễn phí vì level để dạy. Gợi ý của bài tập có giá vì bài tập để thử. Để 0 nếu muốn miễn phí.',
  'author.builder.save.visible': 'Mục tiêu hiện trước khi nộp',
  'author.builder.save.visible-hint':
    'Bỏ chọn để giấu một mục tiêu cho tới lúc người làm nộp bài. Đây không phải cờ "bắt buộc" của level: mọi testcase đều chặn, ẩn hay hiện cũng vậy.',
  'author.builder.save.visible-empty': 'Bản nháp chưa có mục tiêu nào.',
  'author.builder.save.slug': 'Đường dẫn sinh từ tiêu đề',
  'author.builder.save.slug-empty': 'Chưa có. Đặt tiêu đề trước.',
  'author.builder.save.unauthorized':
    'Chưa lưu được: lưu bài tập đòi tài khoản soạn bài. Màn game không bắt đăng nhập, nên hãy đăng nhập ở một tab khác rồi bấm lại. Bản nháp của bạn vẫn nằm nguyên ở đây.',
  'author.builder.save.done': (p: { code: string }) =>
    `Đã lưu thành bài ${p.code}, ở trạng thái nháp. Mở trang soạn bài để xem lại rồi xuất bản.`,

  /*
   * Mã lỗi của RIÊNG đường lưu, không trùng `author.builder.issue.*`. Hai tập
   * trả lời hai câu khác nhau: tập kia hỏi *"bản nháp đã thành một level chưa"*,
   * tập này hỏi *"phần thêm của bài tập đã đủ chưa"*. Gộp làm một sẽ làm danh
   * sách lỗi của đường xuất JSON mọc thêm những câu không liên quan tới nó.
   */
  'author.builder.save.issue.nhap-con-loi':
    'Bản nháp còn lỗi ở danh sách trên. Bài tập lấy đề bài, mục tiêu và trạng thái đầu từ chính bản nháp, nên sửa hết ở đó trước.',
  'author.builder.save.issue.chua-chon-chu-de':
    'Chưa chọn chủ đề nào. Chủ đề là thứ người học dùng để lọc kho bài, nên một bài không chủ đề là một bài không ai tìm thấy.',
  'author.builder.save.issue.qua-nhieu-chu-de':
    'Chọn quá ba chủ đề. Nhiều hơn ba nghĩa là bài đang làm quá nhiều việc cùng lúc.',
  'author.builder.save.issue.chu-de-la': 'Chủ đề này không thuộc tập chủ đề của game Git.',
  'author.builder.save.issue.gia-goi-y-lech-so-luong':
    'Số ô điểm trừ không khớp số gợi ý. Điền bù một số 0 cho ô thiếu sẽ lặng lẽ biến một gợi ý có giá thành gợi ý miễn phí, nên chỗ này chặn thay vì đoán.',
  'author.builder.save.issue.gia-goi-y-ngoai-khoang':
    'Điểm trừ của gợi ý phải là số nguyên từ 0 tới 1000. Số âm sẽ là một gợi ý CỘNG điểm.',
  'author.builder.save.issue.co-hien-lech-so-luong':
    'Số ô hiện trước không khớp số mục tiêu, nên một mục tiêu đang không biết mình hiện hay ẩn.',
  'author.builder.save.issue.slug-rong':
    'Tiêu đề không sinh ra được đường dẫn nào. Thêm chữ và số vào tiêu đề, thay vì chỉ dấu câu.',
  'author.builder.save.issue.slug-qua-dai':
    'Đường dẫn sinh từ tiêu đề dài quá 120 ký tự. Rút gọn tiêu đề lại.',

  /*
   * MẤT MÁT, tập thứ ba: không phải lỗi, và cố ý KHÔNG chặn nút Lưu.
   *
   * Câu này phải nói ra hậu quả LÚC CHƠI (`null` = mọi lệnh đều dùng được), chứ
   * không chỉ nói "trường này không lưu". Người soạn đặt một tập lệnh hạn chế vì
   * họ muốn bài KHÓ theo một kiểu nhất định; biết rằng "nó không lưu" mà không
   * biết "nên bài sẽ cho dùng mọi lệnh" thì vẫn không đoán được bài mình ra sao.
   */
  'author.builder.save.loss.allowed-commands-mat':
    'Tập lệnh cho phép sẽ KHÔNG được lưu vào bài tập, vì kho bài không có ô cho nó. Tệp level bạn xuất ra thì vẫn giữ. Bài lưu từ đây cho người học dùng mọi lệnh Git; nếu tập hạn chế là phần cốt lõi của bài, hãy dùng đường xuất tệp level thay vì lưu thành bài tập.',
} as const satisfies Surface<'author'>;

export const authorIntentionalThree = {
  'author.meta':
    '2026-09-10: đúng ba route tồn tại dưới app/author mà lane 16.G sở hữu (danh sách, tạo mới, sửa). Route thứ tư của cây này là app/author/problems, thuộc lane 16.G2, và nó sẽ mang tiêu đề riêng dưới tiền tố khác.',
  'author.kind':
    '2026-09-10: đúng ba loại tồn tại trong hợp đồng dữ liệu ContentKind (lesson, lab, playground), kiểm tại packages/shared-types/src/authoring.ts. Loại thứ tư nào cũng phải sửa union đó trước, và lúc đó nhóm này thôi là ba.',
  'author.item.desc':
    '2026-09-10: ba nhánh vì stepCount mang nghĩa khác nhau theo ContentKind, không phải một phân loại ba. Nhánh playground cố ý không nhắc con số vì playground không có thân, nên nó luôn bằng 0.',
  'author.problem.meta':
    '2026-09-10: đúng ba route tồn tại dưới app/author/problems (danh sách, soạn mới, sửa theo mã), kiểm bằng ba file page.tsx trong cây đó. Route thứ tư phải thêm một page.tsx trước, và lúc đó nhóm này thôi là ba.',
  'author.problem.state':
    '2026-09-10: đúng ba giá trị tồn tại trong PROBLEM_STATES tại packages/games/src/k8s/problem.ts dòng 85 (draft, published, archived). Đây là union KHÁC với ContentState của author.state, thứ có bốn giá trị vì thêm publishing.',
  'author.problem.seedable':
    '2026-09-15: dung ba khoa vi o danh dau nay co dung hai trang thai HIEN THI (bat duoc / chua bat duoc) cong mot nhan, khong phai mot phan loai ba. Cau available va unavailable khong thay the nhau duoc: mot cau mo ta nang luc khi plugin khai seedSpec, cau kia mo ta TINH TRANG THAT hom nay (khong plugin nao khai no, xem core/problem-plugin.ts). Gop hai cau lam mot la hua mot thu chua ton tai. Khoa thu tu chi xuat hien khi co trang thai hien thi thu ba.',
} as const satisfies IntentionalThree;

