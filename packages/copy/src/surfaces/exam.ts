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

  'exam.card-class': (p: { name: string }): string => `Lớp ${p.name}`,
  'exam.card-problems': (p: { count: number }): string => `${String(p.count)} bài`,
  'exam.card-duration': (p: { minutes: number }): string => `${String(p.minutes)} phút`,

  'exam.status-not-started': 'Chưa vào làm',
  'exam.status-in-progress': 'Đang làm',
  'exam.status-done': 'Đã xong',

  'exam.open': 'Mở kỳ thi',
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
 */
export const examIntentionalThree: IntentionalThree = {};
