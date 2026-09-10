import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `author.`, sở hữu bởi lane 16.G (L6). RỖNG là đúng ở lượt L0.
 *
 * ⚠ Ranh giới bản đồ so với nội dung cắn ở đây hơn mọi lane khác. Chữ VỎ của
 * trình soạn (nhãn nút, tiêu đề cột, thông báo validate, trạng thái nháp) vào
 * bản đồ. Chữ RUỘT mà tác giả gõ vào ở lại dạng dữ liệu và không bao giờ đi qua
 * file này.
 *
 * Phép thử khi lưỡng lự: số bản sao của chuỗi này bị chặn bởi số màn hình, hay
 * bởi số mục nội dung? Số màn hình thì vào bản đồ.
 */
export const author = {} as const satisfies Surface<'author'>;

export const authorIntentionalThree = {} as const satisfies IntentionalThree;
