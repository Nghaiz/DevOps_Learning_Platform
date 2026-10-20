import { describe, expect, it } from 'vitest';
import { cn } from './cn.ts';

describe('cn biết khoá theme riêng của ds', () => {
  it('cỡ chữ `text-md` không bị nuốt khi đứng cạnh màu chữ `text-ink`', () => {
    expect(cn('text-md', 'text-ink')).toBe('text-md text-ink');
  });

  it('hai cỡ chữ thì cái sau thắng, như mọi lớp cùng nhóm', () => {
    expect(cn('text-md', 'text-sm')).toBe('text-sm');
  });
});
