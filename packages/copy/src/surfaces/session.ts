import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `session.`, sở hữu bởi lane 16.D (L3). RỖNG là đúng ở lượt L0.
 *
 * ⚠ Nhãn hạng sandbox chuyển từ `catalog-labels.ts:10-19` sang đây, kèm NGUYÊN
 * VĂN khối chú thích của nó, vì đó là một phán quyết biên tập chứ không phải
 * một ghi chú:
 *
 *   Tier giữ NGUYÊN tên kỹ thuật, không dịch và không kèm lời hứa ("nhẹ hơn",
 *   "an toàn hơn"). Ba runtime này khác nhau ở thứ đo được trên hạ tầng cụ thể,
 *   và một tính từ dán ở đây sẽ là một khẳng định mà trang danh mục không có dữ
 *   liệu để bảo vệ.
 *
 * Nhóm đó là đúng ba khoá anh em, nên nó cần một dòng trong
 * `sessionIntentionalThree`. Hợp đồng §3.3 đã viết sẵn dòng đó:
 *
 *     'session.tier': '2026-09-10: đúng ba runtime sandbox tồn tại (sysbox, gvisor, kata), khớp SandboxTierName.',
 *
 * ⚠ Khiếm khuyết đã đo mà lane này phải sửa bằng chuỗi: lab k8s hiện "Còn 0
 * chỗ" khi quota bị setup hỏng giữ lại. Dùng `Counted`, và nhánh `zero` phải
 * nói ra việc người đọc làm được ngay bây giờ, không chỉ nói ra con số:
 *
 *     'session.slots': {
 *       zero: 'Hết chỗ. Lab này mở lại khi có người thoát.',
 *       one:  'Còn 1 chỗ.',
 *       many: (n) => `Còn ${n} chỗ.`,
 *     } satisfies Counted,
 */
export const session = {} as const satisfies Surface<'session'>;

export const sessionIntentionalThree = {} as const satisfies IntentionalThree;
