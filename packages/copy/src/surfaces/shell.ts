import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `shell.`, sở hữu bởi lane 16.B (L1). RỖNG là đúng ở lượt L0.
 *
 * L0 commit file này đã rỗng và đã đăng ký sẵn trong `registry.ts` để lane không
 * phải chạm `registry.ts` (§6.1). Ghi chuỗi của bạn vào ĐÂY, không ghi vào file
 * surface của lane khác, và không chép một chuỗi của `common.` sang đây.
 *
 * Thêm một khoá: đặt tên `shell.<màn-hoặc-component>.<slot>`, chữ thường, phân
 * đoạn nội bộ dùng gạch nối. Cần một chuỗi dùng chung với surface khác thì nhắn
 * L0 thêm vào `common.`.
 *
 * Nhóm đúng ba khoá anh em là vi phạm V5. Cố ý ba thì khai vào
 * `shellIntentionalThree` bên dưới theo khuôn `YYYY-MM-DD: lý do`, phần lý do
 * tối thiểu 20 ký tự.
 */
export const shell = {} as const satisfies Surface<'shell'>;

export const shellIntentionalThree = {} as const satisfies IntentionalThree;
