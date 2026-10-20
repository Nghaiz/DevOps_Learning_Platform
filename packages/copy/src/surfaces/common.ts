import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `common.` và `unit.`: chữ dùng chung từ hai màn trở lên, và đơn vị đếm.
 *
 * Danh từ danh mục (`bài học`, `lab`…) không ở đây mà ở `catalog.noun.*`. Chuỗi chỉ
 * một màn dùng thì thuộc surface của màn đó.
 */
export const common = {
  // ── Trang không tìm thấy và trang lỗi ───────────────────────────────────
  'common.not-found.code': '404',
  'common.not-found.title': 'Không tìm thấy trang này',
  'common.not-found.body': 'Đường dẫn có thể gõ sai, hoặc nội dung đã bị gỡ. Chọn một mục bên dưới để đi tiếp.',
  'common.not-found.home': 'Về trang đầu',
  'common.crash.title': 'Trang này vừa gặp lỗi',
  'common.crash.body': 'Lỗi nằm ở phía hệ thống, không phải do bạn bấm sai. Thử tải lại; nếu vẫn lỗi, gửi mã bên dưới cho giảng viên.',
  'common.crash.retry': 'Tải lại phần này',
  'common.crash.digest': (p: { digest: string }) => `Mã lỗi: ${p.digest}`,
  'common.meta-description': 'Học DevOps bằng máy ảo chạy thật: bài học, lab, đề chấm tự động và trò chơi.',
  'common.og-description': 'Học DevOps trên máy ảo chạy thật, ngay trong trình duyệt.',

  // ── Nhãn thao tác lặp ở nhiều màn ───────────────────────────────────────
  'common.action.save': 'Lưu',
  'common.action.cancel': 'Huỷ',
  'common.action.close': 'Đóng',
  'common.action.delete': 'Xoá',
  'common.action.edit': 'Sửa',
  'common.action.retry': 'Thử lại',
  'common.action.back': 'Quay lại',
  'common.action.prev': 'Trước',
  'common.action.copy': 'Sao chép',
  'common.action.copied': 'Đã sao chép',
  'common.action.confirm': 'Xác nhận',
  'common.action.search': 'Tìm',
  'common.action.clear-filter': 'Bỏ lọc',
  'common.action.reload': 'Tải lại trang',
  'common.action.more': 'Xem thêm',
  'common.action.actions': 'Thao tác khác',
  'common.action.dismiss': 'Bỏ qua',
  // Nhãn phân trang khớp từng chữ với câu hướng dẫn ở `me.history.empty-page-go-*`.
  'common.pager.first': 'Về trang đầu',
  'common.pager.prev': 'Trang trước',
  'common.pager.next': 'Trang sau',
  'common.pager.page': (p: { page: number }) => `Trang ${String(p.page)}`,
  'common.state.loading': 'Đang tải',
  'common.state.saving': 'Đang lưu',
  'common.state.empty': 'Chưa có gì ở đây',
  'common.state.offline': 'Mất kết nối tới máy chủ',
  'common.label.required': 'Bắt buộc',
  'common.label.optional': 'Không bắt buộc',
  'common.difficulty.beginner': 'Cơ bản',
  'common.difficulty.intermediate': 'Trung cấp',
  'common.difficulty.advanced': 'Nâng cao',

  'unit.minute': (p: { n: number }) => `${p.n} phút`,
  'unit.second': (p: { n: number }) => `${p.n} giây`,
  'unit.hour': (p: { n: number }) => `${p.n} giờ`,
  'unit.day': (p: { n: number }) => `${p.n} ngày`,
  'unit.step': (p: { n: number }) => `${p.n} bước`,
  'unit.task': (p: { n: number }) => `${p.n} nhiệm vụ`,
  'unit.point': (p: { n: number }) => `${p.n} điểm`,
} as const satisfies Surface<'common' | 'unit'>;

export const commonIntentionalThree = {
  'common.difficulty':
    '2026-09-10: đúng ba mức tồn tại trong hợp đồng dữ liệu ScenarioDifficulty (beginner, intermediate, advanced), kiểm tại packages/shared-types/src/scenario.ts.',
} as const satisfies IntentionalThree;
