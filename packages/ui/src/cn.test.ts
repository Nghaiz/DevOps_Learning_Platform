import { describe, expect, it } from 'vitest';
import { cn } from './cn.ts';

describe('cn', () => {
  it('gộp nhiều class thành một chuỗi', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('bỏ qua giá trị falsy (điều kiện className)', () => {
    const disabled = false;
    expect(cn('a', disabled && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('khử trùng lặp Tailwind — class sau thắng class trước cùng nhóm', () => {
    // tailwind-merge: 'px-2' và 'px-4' cùng nhóm padding-x — giữ cái sau.
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
