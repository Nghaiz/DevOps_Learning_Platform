import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `admin.`, sở hữu bởi lane 16.F (L5). RỖNG là đúng ở lượt L0.
 *
 * Mọi thông báo lỗi của lane là `ErrorEntry`, không phải `Static`: trang quản
 * trị là nơi một mã thoát trần dễ bị coi là đủ, và tầng kiểu ở đây từ chối đúng
 * thói quen đó. `code` là siêu dữ liệu để dán vào phiếu hỗ trợ, không bao giờ
 * là toàn bộ thông báo.
 */
export const admin = {} as const satisfies Surface<'admin'>;

export const adminIntentionalThree = {} as const satisfies IntentionalThree;
