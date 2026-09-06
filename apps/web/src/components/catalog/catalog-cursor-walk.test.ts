import { describe, expect, it } from 'vitest';
import { FIRST_PAGE, currentCursor, pushCursor, type CursorStack } from '../../lib/cursor-stack';
import { NO_FILTER, buildCatalogListInput } from './catalog-input';

/**
 * Đi hết một kho giả có ngữ nghĩa KEYSET giống server (`WHERE id > cursor ORDER
 * BY id LIMIT n+1`) và khẳng định: không mục nào bị lặp, không mục nào bị bỏ.
 *
 * ⛔ Vì sao phải mô phỏng thay vì chỉ test `pushCursor` lẻ: cái sai thật của
 * phân trang cursor không nằm trong một lời gọi, nó nằm ở **chuỗi** lời gọi —
 * đẩy nhầm `items[0].id` thay vì `nextCursor`, hay quên `undefined` ở trang
 * đầu, đều cho một `pushCursor` trông đúng và một vòng lặp trả sai dữ liệu.
 *
 * Đây là phép kiểm SỔ SÁCH PHÍA CLIENT. Tính đúng của keyset ở tầng SQL là
 * chuyện của `repository-page-sql.integration.test.ts` (lane BE1); bộ này chỉ
 * chứng minh client đọc và truyền lại cursor đúng.
 */
describe('đi hết kho bằng cursor — không lặp, không sót', () => {
  const CATALOG = ['a-01', 'b-02', 'c-03', 'd-04', 'e-05', 'f-06', 'g-07'] as const;

  function fetchPage(cursor: string | undefined, limit: number): { items: string[]; nextCursor: string | null } {
    const after = cursor === undefined ? [...CATALOG] : CATALOG.filter((id) => id > cursor);
    const window = after.slice(0, limit + 1);
    const hasMore = window.length > limit;
    const items = hasMore ? window.slice(0, limit) : window;
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last !== undefined ? last : null };
  }

  function walk(limit: number): string[] {
    let stack: CursorStack = FIRST_PAGE;
    const seen: string[] = [];

    for (let guard = 0; guard < 50; guard += 1) {
      const input = buildCatalogListInput(NO_FILTER, currentCursor(stack));
      const page = fetchPage(input.cursor, limit);
      seen.push(...page.items);

      const advanced = pushCursor(stack, page.nextCursor);
      if (advanced === stack) {
        return seen;
      }
      stack = advanced;
    }
    throw new Error('vòng lặp không kết thúc — cursor không tiến');
  }

  it.each([1, 2, 3, 7, 20])('limit=%i thu đúng toàn bộ kho, đúng thứ tự, không trùng', (limit) => {
    const seen = walk(limit);

    expect(seen).toEqual([...CATALOG]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('đối chứng âm: đẩy id ĐẦU trang thay vì nextCursor ⇒ lặp vô hạn hoặc trùng lặp', () => {
    // Chứng minh bài kiểm trên biết kêu. Cùng vòng lặp, chỉ đổi đúng giá trị
    // được đẩy vào ngăn xếp — thứ mà một lỗi copy-paste thật sẽ tạo ra.
    let stack: CursorStack = FIRST_PAGE;
    const seen: string[] = [];
    let looped = false;

    for (let guard = 0; guard < 12; guard += 1) {
      const page = fetchPage(currentCursor(stack), 3);
      seen.push(...page.items);
      const wrong = page.nextCursor === null ? null : (page.items[0] ?? null);
      const advanced = pushCursor(stack, wrong);
      if (advanced === stack) {
        break;
      }
      stack = advanced;
      if (guard === 11) {
        looped = true;
      }
    }

    expect(new Set(seen).size !== seen.length || looped).toBe(true);
  });
});
