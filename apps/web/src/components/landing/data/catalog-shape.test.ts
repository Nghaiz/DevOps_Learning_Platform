import { describe, expect, it } from 'vitest';
import { COUNT_KINDS, hasAnyCount } from './catalog-shape';
import type { CountKind, LandingCounts } from './catalog-shape';

/**
 * `null` là "đọc lỗi", 0 là một giá trị thật. Dải số liệu chỉ ẩn khi KHÔNG đọc được loại nào;
 * nhầm 0 thành lỗi (hay ngược lại) là khai sai với người xem.
 */

const counts = (overrides: Partial<Record<CountKind, number | null>> = {}): LandingCounts => {
  const base = Object.fromEntries(COUNT_KINDS.map((kind) => [kind, null])) as Record<CountKind, number | null>;
  return { ...base, ...overrides };
};

describe('catalog-shape · hasAnyCount', () => {
  it('false khi mọi loại đều null', () => {
    expect(hasAnyCount(counts())).toBe(false);
  });

  it('true khi đúng MỘT loại có giá trị, với từng loại', () => {
    for (const kind of COUNT_KINDS) {
      expect(hasAnyCount(counts({ [kind]: 7 })), kind).toBe(true);
    }
  });

  it('0 được tính là một giá trị, không phải lỗi', () => {
    for (const kind of COUNT_KINDS) {
      expect(hasAnyCount(counts({ [kind]: 0 })), kind).toBe(true);
    }
  });

  it('true khi mọi loại đều là 0', () => {
    const zeros = Object.fromEntries(COUNT_KINDS.map((kind) => [kind, 0])) as Record<CountKind, number>;
    expect(hasAnyCount(zeros)).toBe(true);
  });

  it('true khi đọc được một phần, phần còn lại lỗi', () => {
    expect(hasAnyCount(counts({ lessons: 12, labs: null, games: 3 }))).toBe(true);
  });

  it('phủ đủ sáu loại số liệu', () => {
    expect(COUNT_KINDS).toEqual(['lessons', 'labs', 'paths', 'playgrounds', 'quizzes', 'games']);
  });
});
