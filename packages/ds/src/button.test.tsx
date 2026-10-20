import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button.tsx';

/**
 * `asChild` + `icon`: lớp CSS và biểu tượng phải vào TRONG phần tử con.
 *
 * Bản đầu bọc biểu tượng và `Slottable` trong một Fragment. `Slot` tìm `Slottable` bằng
 * `Children.toArray`, hàm không duỗi Fragment, nên nó clone chính cái Fragment: mọi nút dạng
 * link có biểu tượng mất nền, mất `inline-flex`, biểu tượng rớt thành dòng riêng (rà ảnh
 * 2026-10-20: "Mở trong game", nút chính hero CI/CD, "Về trang đầu").
 */
describe('Button asChild', () => {
  it('đưa lớp của nút và biểu tượng vào trong link', () => {
    render(
      <Button asChild variant="primary" icon="arrow-left" iconRight="arrow-right">
        <a href="/x">Về trang đầu</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Về trang đầu' });
    expect(link.className).toContain('inline-flex');
    expect(link.className).toContain('bg-acc-solid');
    const icons = link.querySelectorAll('svg[data-icon]');
    expect([...icons].map((svg) => svg.getAttribute('data-icon'))).toEqual(['arrow-left', 'arrow-right']);
    expect(link.firstElementChild?.getAttribute('data-icon')).toBe('arrow-left');
  });

  it('không biểu tượng thì vẫn nhận lớp của nút', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/y">Mở</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Mở' }).className).toContain('inline-flex');
  });
});
