import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `home.`, sở hữu bởi lane 16.E (L4). RỖNG là đúng ở lượt L0.
 *
 * ⚠ Lane này là nơi luật V5 cắn mạnh nhất, và nó đã cắn rồi:
 * `value-props.tsx:6` tự khai `ba luận điểm` và `getting-started.tsx:4` tự khai
 * `ba bước`, không cái nào là một mảng. Bộ dò `scanThree` bắt cả nhóm ba khoá
 * anh em chính vì hình dạng đó, nên đừng dựng lại nó dưới dạng
 * `home.value.1` / `.2` / `.3`.
 *
 * Bốn luận điểm hay hai luận điểm đều được. Đúng ba thì phải khai vào
 * `homeIntentionalThree` kèm ngày và một lý do nói được vì sao con số ba tới từ
 * dữ liệu chứ không tới từ nhịp của một trang landing.
 */
export const home = {} as const satisfies Surface<'home'>;

export const homeIntentionalThree = {} as const satisfies IntentionalThree;
