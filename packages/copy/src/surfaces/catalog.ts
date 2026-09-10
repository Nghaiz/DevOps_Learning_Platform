import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `catalog.`, sở hữu bởi lane 16.C (L2). RỖNG là đúng ở lượt L0.
 *
 * ⚠ Việc lớn nhất của lane này KHÔNG phải viết chuỗi mới, mà là chuyển
 * `apps/web/src/components/catalog/catalog-labels.ts` sang đây theo §1.6 của
 * hợp đồng. Bốn hàm quyết định biên tập (`describeCatalogEmpty`,
 * `describePageScope`, `describeSortScope`, `describeResultCount`) đi cùng,
 * nhưng ĐỔI KIỂU TRẢ VỀ:
 *
 *     // SAI: bộ dò chỉ nhìn thấy nhánh mà probe đi vào.
 *     export function describeCatalogEmpty(args: Args): string;
 *
 *     // ĐÚNG: mọi nhánh đều là một khoá tĩnh, bộ dò quét được toàn bộ.
 *     export function describeCatalogEmpty(args: Args): { key: TextKey; params?: Params };
 *
 * Đây không phải chuyện phong cách. Một hàm trả về câu ghép tại chỗ thì cổng
 * gạch ngang dài chỉ soi được nhánh nó gọi tới, và nhánh còn lại đi thẳng ra
 * người dùng không qua cổng nào.
 *
 * ⚠ Khối chú thích ở `catalog-labels.ts:39-50` (cấm khẳng định tổng số mục khi
 * server chỉ trả `nextCursor`) chuyển sang NGUYÊN VĂN. Đó là chuẩn biên tập của
 * dự án, và nó phải sống ở nơi giữ chuỗi.
 *
 * ⚠ Ba chuỗi trong `catalog-labels.ts` hôm nay chứa U+2014 và sẽ làm T1a đỏ nếu
 * chép nguyên: hai câu trong `describePageScope`/`describeCatalogEmpty` và một
 * trong `describeSortScope`. §1.2 của hợp đồng đã đưa sẵn bản thay cho câu đầu
 * (dấu phẩy thay ký tự đó). Viết lại hai câu còn lại theo cùng cách.
 *
 * Danh từ danh mục thuộc về đây, không thuộc `common.`: `catalog.noun.lessons`
 * = 'bài học', `catalog.noun.labs` = 'lab', và ba cái còn lại. Tập cố định bởi
 * `CatalogKind`, đúng 5 giá trị, nên nó không rơi vào luật đúng-ba.
 */
export const catalog = {} as const satisfies Surface<'catalog'>;

export const catalogIntentionalThree = {} as const satisfies IntentionalThree;
