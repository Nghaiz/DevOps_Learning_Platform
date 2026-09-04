import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Kbd, Separator } from './separator.tsx';

afterEach(() => {
  cleanup();
});

describe('Separator', () => {
  it('mặc định orientation="horizontal", decorative ⇒ role="none" (không phải separator ngữ nghĩa)', () => {
    const { container } = render(<Separator />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('decorative={false} ⇒ mang role="separator" thật cho trình đọc màn hình', () => {
    render(<Separator decorative={false} orientation="vertical" />);
    const el = screen.getByRole('separator');
    expect(el.getAttribute('aria-orientation')).toBe('vertical');
  });
});

describe('Kbd', () => {
  it('render đúng nội dung phím tắt', () => {
    render(<Kbd>Esc</Kbd>);
    expect(screen.getByText('Esc').tagName).toBe('KBD');
  });
});
