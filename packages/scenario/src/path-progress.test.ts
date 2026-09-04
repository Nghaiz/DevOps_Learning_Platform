import { describe, expect, it } from 'vitest';
import {
  isItemUnlocked,
  nextItemIdOf,
  passedCountOf,
  pathItemKey,
  viewPathItems,
  type PathItemRow,
} from './path-progress.ts';

/**
 * Luật mở khoá của lộ trình (P10 10.A task 4 / AC #3).
 *
 * Hàm được test ở đây là bản DUY NHẤT của luật, và nó chạy ở server cả khi vẽ
 * lẫn khi chặn — xem chú thích đầu `path-progress.ts`.
 */

function row(over: Partial<PathItemRow> & { ordinal: number }): PathItemRow {
  return {
    kind: 'lesson',
    itemId: `bai-${String(over.ordinal)}`,
    title: `Bài ${String(over.ordinal)}`,
    passed: false,
    ...over,
  };
}

describe('viewPathItems — học tự do là MẶC ĐỊNH', () => {
  it('sequential=false ⇒ không item nào bị khoá, kể cả item cuối', () => {
    const items = viewPathItems([row({ ordinal: 0 }), row({ ordinal: 1 }), row({ ordinal: 2 })], false);
    expect(items.map((item) => item.state)).toEqual(['available', 'available', 'available']);
  });

  it('item đã đạt hiện là passed dù lộ trình tự do', () => {
    const items = viewPathItems([row({ ordinal: 0, passed: true }), row({ ordinal: 1 })], false);
    expect(items.map((item) => item.state)).toEqual(['passed', 'available']);
  });
});

describe('viewPathItems — sequential', () => {
  it('item N mở khi N−1 đạt; phần còn lại khoá', () => {
    const items = viewPathItems(
      [row({ ordinal: 0, passed: true }), row({ ordinal: 1 }), row({ ordinal: 2 })],
      true,
    );
    expect(items.map((item) => item.state)).toEqual(['passed', 'available', 'locked']);
  });

  /**
   * Một item chưa đạt khoá MỌI item sau nó, không chỉ item liền kề. Luật "chỉ
   * khoá item liền sau" cho phép nhảy cóc qua một mắt xích bằng cách bỏ dở nó —
   * tức là luật tự vô hiệu hoá chính mình.
   */
  it('một item chưa đạt khoá TẤT CẢ item phía sau, không chỉ item kế', () => {
    const items = viewPathItems(
      [row({ ordinal: 0 }), row({ ordinal: 1 }), row({ ordinal: 2 })],
      true,
    );
    expect(items.map((item) => item.state)).toEqual(['available', 'locked', 'locked']);
  });

  /**
   * Xảy ra thật khi tác giả BẬT `sequential` trên lộ trình người ta đã học dở.
   * Hiện đúng thứ đã xảy ra thay vì viết lại lịch sử — biến một item đã đạt
   * thành "khoá" là cách nhanh nhất để người học tin hệ thống mất tiến độ.
   */
  it('item đã đạt vẫn là passed kể cả khi item trước nó chưa đạt', () => {
    const items = viewPathItems(
      [row({ ordinal: 0 }), row({ ordinal: 1, passed: true }), row({ ordinal: 2 })],
      true,
    );
    expect(items.map((item) => item.state)).toEqual(['available', 'passed', 'locked']);
  });

  it('sắp theo ordinal, không theo thứ tự mảng đầu vào', () => {
    const items = viewPathItems(
      [row({ ordinal: 2 }), row({ ordinal: 0, passed: true }), row({ ordinal: 1 })],
      true,
    );
    expect(items.map((item) => item.ordinal)).toEqual([0, 1, 2]);
    expect(items.map((item) => item.state)).toEqual(['passed', 'available', 'locked']);
  });
});

describe('pathItemKey — kind là một PHẦN của khoá', () => {
  /**
   * Một lesson và một quiz được phép trùng slug (hai bảng khác nhau, không ràng
   * buộc nào cấm). Dùng riêng `itemId` làm khoá sẽ khiến "đã đạt lesson X" mở
   * khoá luôn "quiz X" — im lặng, và chỉ lộ ra khi có người tình cờ đặt trùng
   * tên.
   */
  it('cùng itemId khác kind cho hai khoá khác nhau', () => {
    expect(pathItemKey({ kind: 'lesson', itemId: 'x' })).not.toBe(
      pathItemKey({ kind: 'quiz', itemId: 'x' }),
    );
  });
});

describe('nextItemId / passedCount — nhãn chỉ nói thứ nó biết', () => {
  const items = viewPathItems(
    [row({ ordinal: 0, passed: true }), row({ ordinal: 1 }), row({ ordinal: 2 })],
    true,
  );

  it('item kế tiếp là item available đầu tiên', () => {
    expect(nextItemIdOf(items)).toBe('bai-1');
  });

  it('đã đạt hết ⇒ không có item kế tiếp, không bịa ra một cái', () => {
    const done = viewPathItems([row({ ordinal: 0, passed: true })], true);
    expect(nextItemIdOf(done)).toBeNull();
  });

  it('passedCount đếm từ items, không từ một cột nào', () => {
    expect(passedCountOf(items)).toBe(1);
  });
});

describe('isItemUnlocked — cổng chặn của paths.openItem', () => {
  const items = viewPathItems(
    [
      row({ ordinal: 0, passed: true }),
      row({ ordinal: 1 }),
      row({ ordinal: 2, kind: 'quiz', itemId: 'quiz-cuoi' }),
    ],
    true,
  );

  it('item đã đạt và item kế tiếp đều mở', () => {
    expect(isItemUnlocked(items, { kind: 'lesson', itemId: 'bai-0' })).toBe(true);
    expect(isItemUnlocked(items, { kind: 'lesson', itemId: 'bai-1' })).toBe(true);
  });

  it('item phía sau một mắt xích chưa đạt thì KHOÁ', () => {
    expect(isItemUnlocked(items, { kind: 'quiz', itemId: 'quiz-cuoi' })).toBe(false);
  });

  it('item không thuộc lộ trình KHÔNG được coi là mở', () => {
    expect(isItemUnlocked(items, { kind: 'lab', itemId: 'khong-thuoc-lo-trinh' })).toBe(false);
  });
});
