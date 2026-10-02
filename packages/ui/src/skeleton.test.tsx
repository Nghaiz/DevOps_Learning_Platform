import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Skeleton } from './skeleton.tsx';

afterEach(() => {
  cleanup();
});

describe('Skeleton', () => {
  it('render với kích thước tuỳ chỉnh qua className và ẩn khỏi trình đọc màn hình', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('h-4');
    expect(el.className).toContain('w-32');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Skeleton — chuyển động', () => {
  /**
   * `prefers-reduced-motion` do khối phổ quát ở cuối `globals.css` lo, KHÔNG
   * phải component này (xem chú thích trong `skeleton.tsx`). Test ở đây vì vậy
   * ghim chiều NGƯỢC LẠI: không được mọc ra một cơ chế thứ hai cho cùng một
   * bảo đảm. Hai chỗ cùng gác một thứ thì sớm muộn trôi khác nhau, và cái sai
   * sẽ là cái không ai nhớ là mình có.
   */
  it('nhịp đập chạy bằng `animate-pulse`, và KHÔNG tự khai lại reduced-motion', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const classes = ((container.firstElementChild as HTMLElement).getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('animate-pulse');
    expect(
      classes.filter((name) => name.startsWith('motion-reduce:')),
      'reduced-motion là SSOT ở globals.css — khai lại ở component là cơ chế trùng',
    ).toEqual([]);
  });

  /**
   * Bản dựng lại cấm gradient làm thẩm mỹ (design-brief §2.7) và cấm bo góc
   * (§0.1): khối chờ là một ô `bg-muted` phẳng, vuông.
   */
  it('mặt khối là ô muted PHẲNG và vuông — không gradient, không bo góc', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const classes = ((container.firstElementChild as HTMLElement).getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('bg-muted');
    expect(classes.filter((name) => /^(bg-linear|bg-gradient|from-|via-|to-)/.test(name))).toEqual([]);
    expect(classes.filter((name) => name.startsWith('rounded-'))).toEqual([]);
  });

  it('không phát ra màu hardcode', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const className = (container.firstElementChild as HTMLElement).getAttribute('class') ?? '';
    expect(className).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(className).not.toMatch(/\b(slate|gray|zinc|neutral)-[0-9]{2,3}\b/);
  });
});
