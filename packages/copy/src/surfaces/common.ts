import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `common.` và `unit.`, sở hữu bởi L0.
 *
 * Bảng sở hữu §6.1 giao L0 ba tiền tố (`common.` `error.` `unit.`) nhưng chỉ hai
 * file (`common.ts` `error.ts`), nên `unit.` ở chung file này. `Surface<'common'
 * | 'unit'>` là thứ giữ cho tiền tố thứ ba không lọt vào đây.
 *
 * ⚠ Lane KHÔNG tự thêm khoá vào file này. Chuỗi dùng ở từ hai surface trở lên
 * đi vào `common.`, và L0 là người thêm (§6.1). Lane cần một khoá chung thì nhắn
 * L0; tự thêm vào surface của mình rồi chép sang là dựng hai nguồn sự thật cho
 * một câu, và hai bản sẽ trôi khác nhau ở lần sửa đầu tiên.
 *
 * ⚠ Ở lượt L0 này bản đồ CỐ Ý mỏng. Nó chỉ chứa thứ đã có nguồn sự thật ngoài
 * giao diện: nhãn thao tác lặp ở mọi màn, và ba mức của `ScenarioDifficulty`.
 * Danh từ danh mục (`bài học` / `lab` / ...) KHÔNG ở đây: §1.2 của hợp đồng đặt
 * chúng ở `catalog.noun.*`, và đoán trước cho lane khác là việc L0 không có dữ
 * liệu để làm.
 */
export const common = {
  // ── Thao tác ────────────────────────────────────────────────────────────
  'common.action.save': 'Lưu',
  'common.action.cancel': 'Huỷ',
  'common.action.close': 'Đóng',
  'common.action.delete': 'Xoá',
  'common.action.edit': 'Sửa',
  'common.action.retry': 'Thử lại',
  'common.action.back': 'Quay lại',
  'common.action.next': 'Tiếp',
  'common.action.prev': 'Trước',
  'common.action.copy': 'Sao chép',
  'common.action.copied': 'Đã sao chép',
  'common.action.confirm': 'Xác nhận',
  'common.action.search': 'Tìm',
  'common.action.clear-filter': 'Bỏ lọc',
  'common.action.reload': 'Tải lại trang',
  'common.action.open': 'Mở',
  'common.action.more': 'Xem thêm',
  'common.action.dismiss': 'Bỏ qua',

  // ── Trạng thái ──────────────────────────────────────────────────────────
  'common.state.loading': 'Đang tải',
  'common.state.saving': 'Đang lưu',
  'common.state.empty': 'Chưa có gì ở đây',
  'common.state.offline': 'Mất kết nối tới máy chủ',

  // ── Nhãn trường ─────────────────────────────────────────────────────────
  'common.label.required': 'Bắt buộc',
  'common.label.optional': 'Không bắt buộc',

  /**
   * `beginner` (miền) so với `basic` (token) là hai từ vựng cố ý lệch nhau:
   * `ScenarioDifficulty` là hợp đồng dữ liệu chạy từ P2, `--difficulty-basic`
   * là hợp đồng token. Bản đồ thông điệp khoá theo TÊN MIỀN, vì nơi gọi cầm
   * trong tay một giá trị `ScenarioDifficulty` chứ không cầm một tên token.
   * Việc nối hai tên đó thuộc về bảng ánh xạ ở nơi dùng, không thuộc về đây.
   */
  'common.difficulty.beginner': 'Cơ bản',
  'common.difficulty.intermediate': 'Trung cấp',
  'common.difficulty.advanced': 'Nâng cao',

  /**
   * Loại từ dính liền danh từ, nên nó nằm trong chính giá trị chứ không nằm
   * trong một bảng loại từ riêng (§1.5). `unit.minute` là số ít về mặt tên gọi
   * và dùng cho mọi `n`: `1 phút` và `5 phút` chung một danh từ.
   */
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
    '2026-09-10: đúng ba mức tồn tại trong hợp đồng dữ liệu ScenarioDifficulty (beginner, intermediate, advanced), kiểm tại packages/shared-types/src/scenario.ts. Mức thứ tư nào cũng phải sửa schema trước, và lúc đó nhóm này thôi là ba.',
} as const satisfies IntentionalThree;
