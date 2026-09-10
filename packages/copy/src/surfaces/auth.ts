import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `auth.`, sở hữu bởi lane 16.B (L1). RỖNG là đúng ở lượt L0.
 *
 * ⚠ Ràng buộc riêng của lane này, từ phase-16.md 16.B: `/forgot-password` và
 * `/reset-password` CHƯA có backend gửi mail. Trạng thái thành công phải nói
 * đúng rằng tính năng chưa bật. Một form gửi vào hư không mà hiện "Đã gửi mail,
 * kiểm hộp thư của bạn" là nói dối người dùng, và đó là một chuỗi, tức là nó
 * hỏng ở đúng file này.
 *
 * Mọi thông báo lỗi của lane là `ErrorEntry` (hai nửa `what` và `next`), không
 * phải `Static`. Việc đó đi qua tầng kiểu nên không cần kiểm tay.
 */
export const auth = {} as const satisfies Surface<'auth'>;

export const authIntentionalThree = {} as const satisfies IntentionalThree;
