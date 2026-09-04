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
