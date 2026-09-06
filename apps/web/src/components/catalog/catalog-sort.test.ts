import { describe, expect, it } from 'vitest';
import {
  compareCount,
  compareDifficulty,
  compareMinutes,
  compareTitle,
  findSortOption,
  sortPage,
  type SortOption,
} from './catalog-sort';

describe('compareTitle — bảng chữ tiếng Việt, không phải code point', () => {
  it('"Ánh" đứng TRƯỚC "Bình"', () => {
    // So sánh thô cho kết quả NGƯỢC vì U+00C1 > U+0042 — đây chính là phép đo
    // phân biệt localeCompare('vi') với toán tử `<`.
    expect(compareTitle({ title: 'Ánh sáng' }, { title: 'Bình thường' })).toBeLessThan(0);
    expect('Ánh sáng' < 'Bình thường').toBe(false);
  });

  it('xếp A→Z ổn định trên một danh sách có dấu', () => {
    const titles = ['Ổ đĩa', 'Ánh xạ', 'Container', 'Đường dẫn', 'Bảo mật'];
    const sorted = sortPage(
      titles.map((title) => ({ title })),
      { key: 'title', label: 'A→Z', compare: compareTitle },
    ).map((item) => item.title);

    expect(sorted.indexOf('Ánh xạ')).toBeLessThan(sorted.indexOf('Bảo mật'));
    expect(sorted.indexOf('Bảo mật')).toBeLessThan(sorted.indexOf('Container'));
    expect(sorted.indexOf('Container')).toBeLessThan(sorted.indexOf('Đường dẫn'));
  });
});

describe('compareDifficulty — dễ đến khó', () => {
  it('beginner trước intermediate trước advanced', () => {
    expect(compareDifficulty({ difficulty: 'beginner' }, { difficulty: 'intermediate' })).toBeLessThan(0);
    expect(compareDifficulty({ difficulty: 'intermediate' }, { difficulty: 'advanced' })).toBeLessThan(0);
    expect(compareDifficulty({ difficulty: 'advanced' }, { difficulty: 'advanced' })).toBe(0);
  });
});

describe('compareMinutes — "chưa khai" không phải "bằng 0"', () => {
  it('null xuống cuối, không lên đầu danh sách ngắn nhất', () => {
    const sorted = sortPage([{ estimatedMinutes: null }, { estimatedMinutes: 45 }, { estimatedMinutes: 10 }], {
      key: 'duration',
      label: 'Ngắn đến dài',
      compare: compareMinutes,
    });

    expect(sorted.map((item) => item.estimatedMinutes)).toEqual([10, 45, null]);
  });

  it('hai mục cùng null ⇒ giữ nguyên thứ tự tương đối (sort ổn định)', () => {
    const input = [
      { id: 'a', estimatedMinutes: null },
      { id: 'b', estimatedMinutes: 5 },
      { id: 'c', estimatedMinutes: null },
    ];
    const sorted = sortPage(input, { key: 'duration', label: '', compare: compareMinutes });

    expect(sorted.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('sortPage / findSortOption', () => {
  const option: SortOption<{ n: number }> = { key: 'n', label: 'n', compare: compareCount((item) => item.n) };

  it('KHÔNG sửa mảng gốc — nó là cache dùng chung của TanStack Query', () => {
    const original = [{ n: 3 }, { n: 1 }, { n: 2 }];
    const sorted = sortPage(original, option);

    expect(sorted.map((item) => item.n)).toEqual([1, 2, 3]);
    expect(original.map((item) => item.n)).toEqual([3, 1, 2]);
  });

  it('không có option ⇒ trả nguyên tham chiếu (giữ thứ tự server)', () => {
    const original = [{ n: 3 }, { n: 1 }];
    expect(sortPage(original, undefined)).toBe(original);
  });

  it('key lạ ⇒ undefined ⇒ giữ thứ tự kho, không ném', () => {
    expect(findSortOption([option], 'khong-ton-tai')).toBeUndefined();
    expect(findSortOption([option], 'n')).toBe(option);
  });
});
