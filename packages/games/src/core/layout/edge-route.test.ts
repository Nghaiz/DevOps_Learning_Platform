import { describe, expect, it } from 'vitest';
import { type LayoutPoint, countDiagonalSegments, routeEdge } from './edge-route.ts';

describe('routeEdge', () => {
  it('cùng làn — đường thẳng hai điểm', () => {
    expect(routeEdge(0, 0, 1, 0, true)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('rẽ nhánh (cha thứ nhất) — góc đặt ở tầng của CHA', () => {
    // Chuỗi của con bắt đầu tại chính con, nên ô (tầng cha, làn con) còn trống.
    expect(routeEdge(2, 0, 3, 1, true)).toEqual([
      [2, 0],
      [2, 1],
      [3, 1],
    ]);
  });

  it('merge (cha thứ hai) — góc đặt ở tầng của CON', () => {
    // Nhánh của cha thứ hai kết thúc tại đó, nên ô (tầng con, làn cha) còn trống.
    expect(routeEdge(2, 1, 4, 0, false)).toEqual([
      [2, 1],
      [4, 1],
      [4, 0],
    ]);
  });

  it('hai chiều rẽ khác nhau cho hai hình dạng khác nhau', () => {
    const branch = routeEdge(2, 0, 3, 1, true);
    const merge = routeEdge(2, 0, 3, 1, false);
    expect(branch).not.toEqual(merge);
  });

  it('luôn bắt đầu ở cha và kết thúc ở con', () => {
    const cases: readonly (readonly [number, number, number, number, boolean])[] = [
      [0, 0, 1, 0, true],
      [0, 0, 1, 3, true],
      [5, 2, 9, 0, false],
      [1, 4, 2, 1, true],
      [3, 1, 3, 1, false],
    ];
    for (const [fd, fl, td, tl, first] of cases) {
      const points = routeEdge(fd, fl, td, tl, first);
      expect(points[0]).toEqual([fd, fl]);
      expect(points[points.length - 1]).toEqual([td, tl]);
      expect(points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('KHÔNG có đoạn chéo nào ở mọi tổ hợp làn', () => {
    for (let fl = 0; fl < 5; fl += 1) {
      for (let tl = 0; tl < 5; tl += 1) {
        for (const first of [true, false]) {
          const points = routeEdge(0, fl, 3, tl, first);
          expect(
            countDiagonalSegments(points),
            `cha làn ${fl} -> con làn ${tl} (cha thứ nhất: ${String(first)}) có đoạn chéo`,
          ).toBe(0);
        }
      }
    }
  });
});

describe('countDiagonalSegments', () => {
  /**
   * Đối chứng DƯƠNG. Không có nó thì `countDiagonalSegments` trả về hằng 0 vẫn
   * làm mọi khẳng định "không có đoạn chéo" ở trên xanh — đúng hình dạng
   * `rules/green-that-proves-nothing.md` gọi là cái xanh không chứng minh gì.
   */
  it('đếm được đoạn chéo khi có thật', () => {
    const diagonal: readonly LayoutPoint[] = [
      [0, 0],
      [1, 1],
    ];
    expect(countDiagonalSegments(diagonal)).toBe(1);
  });

  it('đếm đúng nhiều đoạn chéo', () => {
    const points: readonly LayoutPoint[] = [
      [0, 0],
      [1, 1],
      [1, 2],
      [2, 3],
    ];
    expect(countDiagonalSegments(points)).toBe(2);
  });

  it('đường rỗng hoặc một điểm cho 0', () => {
    expect(countDiagonalSegments([])).toBe(0);
    expect(countDiagonalSegments([[0, 0]])).toBe(0);
  });
});
