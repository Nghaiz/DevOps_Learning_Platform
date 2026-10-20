import type { IntentionalThree } from '../types.ts';

/**
 * Chữ của kỳ thi phía người học: danh sách `/exams` và màn làm bài
 * `/exams/[examId]` (§18.G.4).
 *
 * ## Vì sao một surface riêng chứ không nhét vào `catalog` hay `session`
 *
 * Kỳ thi có luật riêng: có đồng hồ, có hạn, và một lượt nộp trong đó chịu những
 * cổng mà lượt nộp thường không chịu. Trộn chữ của nó vào một surface sẵn có
 * sẽ làm hai màn khác luật dùng chung một kho từ, và lúc sửa câu cho màn này thì
 * màn kia đổi theo mà không ai định thế.
 *
 * Chữ của phía GIẢNG VIÊN nằm ở `admin.exams.*`, cùng lý do tách. Ngoại lệ có
 * chủ ý: trạng thái cửa sổ (`exam.window.*`) và câu giờ thi (`exam.when.*`) là
 * MỘT bộ từ cho cả hai phía. Giảng viên nói "Chưa mở" còn sinh viên đọc "Sắp
 * mở" cho cùng một kỳ thi là hai người nhìn một sự thật mà không khớp lời; trang
 * quản trị gọi thẳng các khoá này.
 *
 * ## Hai trục trạng thái, không được trộn
 *
 * `exam.window.*` nói về KỲ THI (cửa sổ giờ mở, giờ đóng do giảng viên đặt).
 * `exam.attempt.*` nói về LƯỢT LÀM của chính người xem. Một kỳ thi đang mở có
 * thể chứa một lượt đã hết giờ, và một kỳ thi đã đóng có thể chưa từng có lượt
 * nào. Một nhãn chung cho hai trục là nói sai ít nhất một nửa số ca.
 */
export const exam = {
  'exam.meta-title': 'Kỳ thi',
  'exam.meta-description':
    'Kỳ thi của các lớp bạn đang học: giờ mở, giờ đóng và thời gian còn lại của lượt làm.',

  'exam.title': 'Kỳ thi',
  'exam.lead':
    'Giảng viên mở kỳ thi cho lớp. Đồng hồ do máy chủ giữ, nên đổi giờ trên máy bạn không thêm được phút nào.',
  'exam.loading': 'Đang tải kỳ thi',
  'exam.board-label': 'Danh sách kỳ thi',
  'exam.error-title': 'Không tải được kỳ thi',

  'exam.empty-title': 'Chưa có kỳ thi nào',
  'exam.empty-body': 'Khi giảng viên mở kỳ thi cho lớp của bạn, nó hiện ở đây. Bạn không cần làm gì trước.',

  /*
   * Ba mục lọc bằng đúng miền dữ liệu của bộ lọc (`'all' | 'active' | 'done'`),
   * đặt phẳng chứ không lồng. "Đã kết thúc" gom cả lượt đã nộp, lượt hết giờ, và
   * kỳ thi đã đóng mà bạn chưa vào làm: cả ba đều không còn làm được gì nữa.
   */
  'exam.filter-label': 'Lọc kỳ thi',
  'exam.filter-all': 'Tất cả',
  'exam.filter-active': 'Chưa kết thúc',
  'exam.filter-done': 'Đã kết thúc',
  'exam.filter-empty-title': 'Không có kỳ thi nào ở mục này',
  'exam.filter-empty-body': 'Chọn Tất cả để xem lại mọi kỳ thi của bạn.',

  'exam.summary': (p: { name: string; count: number; minutes: number }): string =>
    `Lớp ${p.name}, ${String(p.count)} bài, ${String(p.minutes)} phút`,

  'exam.window.upcoming': 'Chưa mở',
  'exam.window.open': 'Đang mở',
  'exam.window.closed': 'Đã đóng',

  'exam.when.any': 'Mở bất cứ lúc nào',
  'exam.when.from': (p: { at: string }): string => `Mở từ ${p.at}`,
  'exam.when.until': (p: { at: string }): string => `Đóng lúc ${p.at}`,
  'exam.when.range': (p: { from: string; to: string }): string => `${p.from} đến ${p.to}`,

  'exam.attempt.not-started': 'Chưa vào làm',
  'exam.attempt.in-progress': 'Đang làm',
  'exam.attempt.submitted': 'Đã nộp',
  'exam.attempt.expired': 'Hết giờ',

  'exam.start-title': 'Bạn chưa bắt đầu',
  'exam.start-facts': (p: { count: number; minutes: number }): string =>
    `Đề có ${String(p.count)} bài, bạn có ${String(p.minutes)} phút.`,
  'exam.start-body': 'Đồng hồ chạy từ lúc bạn bấm Bắt đầu, không phải lúc mở trang này.',
  'exam.start': 'Bắt đầu làm bài',

  'exam.not-open-title': 'Kỳ thi chưa mở hoặc đã đóng',
  'exam.start-error-title': 'Chưa bắt đầu được lượt thi',
  'exam.not-open-body':
    'Giờ mở và giờ đóng do máy chủ giữ. Nếu thấy sai, hỏi giảng viên phụ trách lớp.',

  'exam.countdown-label': 'Còn lại',
  'exam.countdown-warn': 'Còn dưới 5 phút',
  'exam.countdown-meter': (p: { percent: number }): string => `Còn ${String(p.percent)}% thời gian làm bài`,
  'exam.deadline-note': (p: { at: string }): string => `Hết giờ lúc ${p.at}`,

  'exam.closed-title': 'Lượt thi đã kết thúc',
  'exam.closed-submitted': 'Bạn đã nộp bài. Lượt nộp sau lúc này không được tính.',
  'exam.closed-expired':
    'Hết giờ trước khi bạn bấm nộp, nên bài được chốt đúng lúc hết hạn. Đóng hay mở lại tab không đổi được điều đó.',

  'exam.submit': 'Nộp bài',
  'exam.submit-busy': 'Đang nộp…',
  'exam.submit-error': 'Chưa nộp được bài.',
  'exam.submitted-toast': 'Đã nộp bài',
  'exam.confirm-title': 'Nộp bài và kết thúc lượt thi?',
  'exam.confirm-body': (p: { left: string }): string =>
    `Bạn còn ${p.left}. Nộp xong thì không làm tiếp được bài nào trong kỳ thi này.`,
  'exam.confirm-cancel': 'Làm tiếp',

  'exam.problems-heading': 'Bài trong đề',
  'exam.problem-play': 'Làm bài',
  'exam.problem-closed': 'Đã khoá',
  'exam.problem-solved': 'Đã giải',
  'exam.problem-statement': 'Đọc đề',
  'exam.solved-count': (p: { solved: number; total: number }): string =>
    `Đã giải ${String(p.solved)}/${String(p.total)} bài`,
} as const;

/**
 * `exam.window.*` là nhóm ba DUY NHẤT của surface này cần khai.
 *
 * `exam.filter-*`, `exam.attempt.*` không phải nhóm ba: bộ lọc nằm phẳng trong
 * nhóm `exam` lớn, còn lượt làm có bốn trạng thái (chưa vào, đang làm, đã nộp,
 * hết giờ).
 */
export const examIntentionalThree: IntentionalThree = {
  'exam.window':
    '2026-10-03: cửa sổ của một kỳ thi chỉ có ba vị trí so với giờ máy chủ: trước opensAt, giữa hai mốc, và từ closesAt trở đi. Đây là ba khoảng của một trục thời gian, không phải một phân loại ba.',
};
