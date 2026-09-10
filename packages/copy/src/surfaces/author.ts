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
 * - **Chuỗi của `app/author/problems`** thuộc lane 16.G2, và lane đó sẽ tự thêm
 *   khoá của nó vào file này. Cố ý KHÔNG đặt trước khoá cho vùng đó: một khoá
 *   không có nơi gọi đi qua cả sáu cổng mà không ô nào đỏ.
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
  'author.kind.playground': 'Playground',

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
  'author.item.updated.unknown': (p: { value: string }) => `Mốc sửa máy chủ gửi không đọc được: ${p.value}`,

  // ── Trang danh sách ───────────────────────────────────────────────────────
  'author.list.title': 'Soạn bài',
  'author.list.lead': 'Bài học, lab và playground do bạn tạo. Danh sách hiển thị đầy đủ, không chia trang.',
  'author.list.new-cta': 'Tạo bài mới',
  'author.list.error-title': 'Không tải được danh sách bài',
  'author.list.empty-title': 'Bạn chưa có bài nào',
  'author.list.empty-body':
    'Tạo bài học có từng bước, lab giao việc rồi chấm, hoặc playground là một sandbox trống. Bài mới luôn ở trạng thái Nháp, người học không thấy cho tới khi bạn xuất bản.',
  'author.list.empty-cta': 'Tạo bài đầu tiên',
  'author.list.filter.all': 'Tất cả',
  'author.list.filter.tab': (p: { label: string; n: number }) => `${p.label} (${String(p.n)})`,
  'author.list.filter.empty.title': (p: { filter: string }) => `Không có bài nào ở trạng thái "${p.filter}"`,
  'author.list.filter.empty.body': 'Đổi bộ lọc phía trên để xem các bài khác.',
  'author.list.publish-failed.title': 'Lượt xuất bản gần nhất trượt',
  'author.list.publish-failed.next': 'Mở bài, sửa chỗ được nêu, rồi xuất bản lại.',

  // ── Trang tạo bài mới ─────────────────────────────────────────────────────
  'author.new.title': 'Tạo bài mới',
  'author.new.lead':
    'Bài mới luôn ở trạng thái Nháp. Bạn lưu được một bản viết dở, vì kiểm tra định dạng chỉ diễn ra lúc xuất bản.',
  'author.new.identity-heading': 'Định danh, không sửa lại được',
  'author.new.kind.label': 'Loại nội dung',
  'author.new.kind.hint':
    'Bài học dẫn từng bước · Lab giao việc rồi chấm · Playground là sandbox trống. Không đổi được sau khi tạo.',
  'author.new.id.label': 'Id',
  'author.new.id.placeholder': 'dlp-chan-doan-cpu',
  'author.new.id.hint':
    'Chỉ [a-z0-9-], 3 tới 63 ký tự. Id đi vào bảng tiến độ và điểm của người học nên nó là vĩnh viễn: đổi id sau này sẽ làm tiến độ cũ mồ côi.',
  'author.new.id.invalid': 'id không hợp lệ',
  'author.new.submit': 'Tạo bản nháp',
  'author.new.created.title': 'Đã tạo bản nháp',
  'author.new.created.body': 'Người học chưa thấy bài này cho tới khi bạn xuất bản.',
  'author.new.error.title': 'Không tạo được bài',
  'author.new.error.next': 'Sửa theo thông báo trên rồi bấm lại. Nếu id đã có người dùng, hãy đổi id.',

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
  'author.issues.row': (p: { message: string }) => `: ${p.message}`,

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
  'author.edit.tab.assets': 'Tệp đính kèm',
  'author.edit.tab.publish': 'Xuất bản',

  'author.edit.body-error.title': 'Không nạp được nội dung bài',
  'author.edit.save-error.title': 'Không lưu được',

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
} as const satisfies Surface<'author'>;

export const authorIntentionalThree = {
  'author.meta':
    '2026-09-10: đúng ba route tồn tại dưới app/author mà lane 16.G sở hữu (danh sách, tạo mới, sửa). Route thứ tư của cây này là app/author/problems, thuộc lane 16.G2, và nó sẽ mang tiêu đề riêng dưới tiền tố khác.',
  'author.kind':
    '2026-09-10: đúng ba loại tồn tại trong hợp đồng dữ liệu ContentKind (lesson, lab, playground), kiểm tại packages/shared-types/src/authoring.ts. Loại thứ tư nào cũng phải sửa union đó trước, và lúc đó nhóm này thôi là ba.',
  'author.item.desc':
    '2026-09-10: ba nhánh vì stepCount mang nghĩa khác nhau theo ContentKind, không phải một phân loại ba. Nhánh playground cố ý không nhắc con số vì playground không có thân, nên nó luôn bằng 0.',
} as const satisfies IntentionalThree;
