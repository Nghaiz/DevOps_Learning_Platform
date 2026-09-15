import type { IntentionalThree } from '../types.ts';

/**
 * Chữ của màn LÀM BÀI THI (§18.G.4), phía người học.
 *
 * ## Vì sao một surface riêng chứ không nhét vào `catalog` hay `session`
 *
 * `catalog.*` nói về danh mục bài tập, `session.*` nói về phiên sandbox. Kỳ thi
 * là một ngữ cảnh thứ ba với một luật riêng: có đồng hồ, có hạn, và một lượt
 * nộp trong đó chịu những cổng mà lượt nộp thường không chịu. Trộn chữ của nó
 * vào một surface sẵn có sẽ làm hai màn hình khác luật dùng chung một kho từ,
 * và lúc sửa câu cho màn này thì màn kia đổi theo mà không ai định thế.
 *
 * Chữ của phía GIẢNG VIÊN nằm ở `admin.exams.*`, cùng lý do tách: hai người
 * đọc khác nhau, hai giọng khác nhau.
 */
export const exam = {
  /*
   * Tiêu đề tab đặt ở surface NÀY, không nối vào nhóm `catalog.meta-title.*`.
   * Nhóm đó có đúng mười khoá và một chú thích nói rõ chúng cùng một luật giọng
   * văn; thêm một khoá thứ mười một vào đó là đổi một tập đã chốt để tiện cho
   * một màn hình thuộc surface khác.
   */
  'exam.meta-title': 'Kỳ thi · DevOps Learning Platform',
  'exam.meta-description':
    'Danh sách kỳ thi của các lớp bạn đang học, kèm thời gian còn lại của từng lượt.',

  'exam.title': 'Kỳ thi của tôi',
  'exam.description':
    'Những kỳ thi thuộc các lớp bạn đang học. Đồng hồ do máy chủ giữ, nên đổi giờ trên máy bạn không thêm được phút nào.',

  'exam.empty-title': 'Chưa có kỳ thi nào',
  'exam.empty-body':
    'Khi giảng viên mở một kỳ thi cho lớp của bạn, nó sẽ hiện ở đây. Không cần làm gì trước.',

  /*
   * ── Bộ lọc theo trạng thái ───────────────────────────────────────────────
   *
   * Ba nhãn lọc KHÁC ba nhãn `exam.status-*` ở dưới, dù cùng nói về trạng
   * thái. `status-*` là nhãn của MỘT lượt thi ("Đã xong"), còn ở đây là nhãn
   * của một TẬP ("Đã kết thúc"): một mục lọc gom cả kỳ thi hết giờ mà bỏ dở,
   * thứ không ai gọi là đã xong. Dùng chung khoá thì mục lọc sẽ hứa sai phạm
   * vi của chính nó.
   *
   * ⚠ Mục "Chưa kết thúc" gộp `status-not-started` với `status-in-progress`,
   * nên số đếm của nó KHÔNG bằng số thẻ mang một nhãn trạng thái nào.
   */
  'exam.filter-label': 'Trạng thái kỳ thi',
  'exam.filter-all': 'Tất cả',
  'exam.filter-active': 'Chưa kết thúc',
  'exam.filter-done': 'Đã kết thúc',

  /*
   * Rỗng vì BỘ LỌC, khác `exam.empty-*` ở trên vốn là rỗng vì chưa có kỳ thi
   * nào. Hai câu phải khác nhau: người đang lọc mà đọc "Chưa có kỳ thi nào" sẽ
   * tin là mình không có kỳ thi, trong khi chúng vẫn ở đó sau một mục lọc khác.
   */
  'exam.filter-empty-title': 'Không có kỳ thi trong mục này',
  'exam.filter-empty-body': 'Chọn mục khác để xem kỳ thi của bạn.',

  'exam.card-class': (p: { name: string }): string => `Lớp ${p.name}`,
  'exam.card-problems': (p: { count: number }): string => `${String(p.count)} bài`,
  'exam.card-duration': (p: { minutes: number }): string => `${String(p.minutes)} phút`,

  'exam.status-not-started': 'Chưa vào làm',
  'exam.status-in-progress': 'Đang làm',
  'exam.status-done': 'Đã xong',

  /*
   * Ba nhãn của MỘT nút, chọn theo trạng thái lượt thi. Tách ba khoá chứ không
   * một câu trung tính: nút là thứ người ta bấm trước khi đọc thẻ, nên nó phải
   * nói đúng cái sắp xảy ra. "Mở kỳ thi" trên một lượt đã kết thúc là một lời
   * hứa sai: không có gì để mở nữa, chỉ còn kết quả để xem.
   */
  'exam.open': 'Mở kỳ thi',
  'exam.open-continue': 'Tiếp tục làm bài',
  'exam.open-result': 'Xem kết quả',
  'exam.back': 'Về danh sách kỳ thi',

  'exam.start-title': 'Chưa bắt đầu',
  'exam.start-body':
    'Đồng hồ chạy từ lúc bạn bấm bắt đầu, không phải từ lúc mở trang. Bấm khi đã sẵn sàng.',
  'exam.start': 'Bắt đầu làm bài',

  'exam.not-open-title': 'Kỳ thi chưa mở hoặc đã đóng',
  'exam.not-open-body':
    'Mốc mở và đóng do máy chủ giữ. Nếu bạn nghĩ đây là nhầm lẫn, hỏi giảng viên phụ trách lớp.',

  'exam.countdown-label': 'Thời gian còn lại',
  'exam.deadline-note': (p: { at: string }): string => `Hết hạn lúc ${p.at}`,

  'exam.closed-title': 'Lượt thi đã kết thúc',
  'exam.closed-body':
    'Bài nộp sau thời điểm này không được tính. Điểm của bạn là những gì đã nộp trước đó.',
  'exam.auto-closed-body':
    'Hết giờ trước khi bạn bấm nộp, nên bài được chốt tại đúng mốc hết hạn. Đóng tab hay mở tab không đổi điều đó.',

  'exam.submit': 'Nộp bài và kết thúc',
  'exam.submit-busy': 'Đang nộp…',
  'exam.submitted-toast': 'Đã nộp bài',

  'exam.problems-heading': 'Bài trong đề',
  'exam.problem-open': 'Làm bài',
  'exam.problem-order': (p: { index: number }): string => `Bài ${String(p.index)}`,
} as const;

/**
 * Không có nhóm ba cố ý nào ở surface này.
 *
 * Ba khoá `exam.status-*` trông như một nhóm ba, và chúng KHÔNG phải: cổng gom
 * theo dấu chấm nên cả surface nằm trong một nhóm `exam` đã lớn hơn ba. Ghi ra
 * để lượt sau không thêm một dòng miễn trừ vô tác dụng vào đây, đúng thứ đã
 * xảy ra với `catalog.problem.verdict` và phải xoá đi (plan §0.3b).
 *
 * Từ 2026-09-16 có thêm hai bộ ba cùng hình dạng đó, `exam.filter-all|active|done`
 * và `exam.open|open-continue|open-result`, và câu trả lời không đổi: đặt PHẲNG,
 * không lồng, không khai miễn trừ. Cả hai đều bằng đúng miền dữ liệu chúng đọc
 * (`'all' | 'active' | 'done'` của bộ lọc, và ba ca `closed` / chưa bắt đầu /
 * đang làm), chứ không phải một phân loại ba do ai đó chọn ra.
 */
export const examIntentionalThree: IntentionalThree = {};
