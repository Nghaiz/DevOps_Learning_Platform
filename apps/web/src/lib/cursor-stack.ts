/**
 * Sổ ghi cursor của MỘT danh sách phân trang — bất kỳ danh sách nào.
 *
 * Module này từng nằm ở `components/catalog/catalog-cursor.ts`, và cái tên đó
 * là thứ duy nhất nói tới danh mục: bốn hàm dưới đây không mang khái niệm nào
 * của `/lessons`, `/labs` hay `/playgrounds`. Sáu chỗ gọi nó — ba client
 * `/admin`, `use-catalog-controls`, và `components/me/use-cursor-pages` — nên
 * ba trong số đó đang import xuyên qua một biên tính năng chỉ để lấy một ngăn
 * xếp chuỗi. Đặt ở `lib/` thì không ai phải mượn tên miền của ai.
 *
 * Phân trang cursor (D9) CHỈ đi tới: server trả `nextCursor` = id của mục cuối
 * trang, và không có phép toán nào cho "trang trước". Nên client phải TỰ nhớ
 * cursor nào đã dùng, và thứ nó nhớ là một NGĂN XẾP: phần tử `i` là cursor
 * dùng để nạp trang `i + 1`. Trang 1 luôn là `undefined` (không cursor).
 *
 * ⛔ Vì sao không lưu "cursor hiện tại" bằng một biến đơn: `CursorPager` phải
 * hiện SỐ TRANG, và số trang không suy được từ một cursor lẻ. Ngăn xếp cho cả
 * hai (`pageNumber` = độ dài) từ MỘT nguồn, không phải hai biến state đi lệch
 * nhau — đúng luật `no-derived-fields`.
 */
export type CursorStack = readonly (string | undefined)[];

/** Trạng thái đầu: một trang, không cursor. */
export const FIRST_PAGE: CursorStack = [undefined];

/** Cursor để nạp trang đang xem. `undefined` = trang 1. */
export function currentCursor(stack: CursorStack): string | undefined {
  return stack[stack.length - 1];
}

/** Số trang đang xem, đếm từ 1. */
export function pageNumber(stack: CursorStack): number {
  return Math.max(1, stack.length);
}

/**
 * Đi tới trang sau bằng `nextCursor` mà server vừa trả.
 *
 * `null` = server nói đã hết ⇒ KHÔNG đẩy gì (trả về đúng ngăn xếp cũ). Đẩy một
 * `null` vào đây sẽ làm trang sau nạp lại **trang 1** dưới nhãn "trang N" —
 * đúng chế độ hỏng mà `list-cursor-contract.test.ts` gọi tên: một câu trả lời
 * hợp lệ, không lỗi, và sai.
 */
export function pushCursor(stack: CursorStack, nextCursor: string | null): CursorStack {
  if (nextCursor === null) {
    return stack;
  }
  return [...stack, nextCursor];
}
