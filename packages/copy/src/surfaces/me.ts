import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `me.`, sở hữu bởi lane 16.H (L7). RỖNG là đúng ở lượt L0.
 *
 * Trang cá nhân và cài đặt. Nhãn thao tác lặp (`Lưu`, `Huỷ`, `Xoá`) đã có ở
 * `common.action.*`, gọi thẳng chứ đừng khai lại dưới tiền tố `me.`: hai bản
 * sao của cùng một nút sẽ trôi khác nhau ở lần sửa đầu tiên, và bản đồ mất đúng
 * thứ nó tồn tại để giữ.
 */
export const me = {} as const satisfies Surface<'me'>;

export const meIntentionalThree = {} as const satisfies IntentionalThree;
