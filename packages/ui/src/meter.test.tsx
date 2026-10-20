import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Meter, filledSegments } from './meter.tsx';

afterEach(() => {
  cleanup();
});

describe('Meter', () => {
  it('mang `role="meter"` + tên + giá trị cho trình đọc màn hình', () => {
    render(<Meter value={18} max={30} label="Sức chứa máy chủ" />);
    const meter = screen.getByRole('meter', { name: 'Sức chứa máy chủ' });
    expect(meter.getAttribute('aria-valuenow')).toBe('18');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('30');
  });

  it('giá trị ngoài [0, max] bị kẹp, `max` ≤ 0 ra thước rỗng', () => {
    const { rerender } = render(<Meter value={45} max={30} label="Đo" />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('30');
    rerender(<Meter value={-3} max={30} label="Đo" />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('0');
    rerender(<Meter value={5} max={0} label="Đo" />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByRole('meter').getAttribute('aria-valuemax')).toBe('0');
  });

  it('thanh liền: phần tô co theo tỉ lệ bằng `scaleX`', () => {
    const { container } = render(<Meter value={1} max={4} label="Đo" />);
    const fill = container.querySelector('[data-slot="meter-fill"]') as HTMLElement;
    expect(fill.style.transform).toBe('scaleX(0.25)');
  });

  it('`segments` ⇒ đúng N đoạn, tô theo tỉ lệ', () => {
    const { container } = render(<Meter value={18} max={30} segments={10} label="Đo" />);
    expect(container.querySelectorAll('[data-slot="meter-segment"]')).toHaveLength(10);
    expect(container.querySelectorAll('[data-filled="true"]')).toHaveLength(6);
  });

  /**
   * Hai ca biên đọc sai nghĩa nếu chỉ làm tròn: 1/30 chỗ mà thước trống trơn
   * thì đọc thành "chưa ai dùng", 29/30 mà thước kín thì đọc thành "hết chỗ".
   */
  it('không bao giờ tô 0 đoạn khi còn giá trị, cũng không tô kín khi chưa đầy', () => {
    expect(filledSegments(1 / 30, 10)).toBe(1);
    expect(filledSegments(29 / 30, 10)).toBe(9);
    expect(filledSegments(0, 10)).toBe(0);
    expect(filledSegments(1, 10)).toBe(10);
  });

  it.each([
    ['primary', 'bg-primary'],
    ['success', 'bg-success'],
    ['warning', 'bg-warning'],
    ['destructive', 'bg-destructive'],
    ['docker', 'bg-line-docker'],
    ['iac', 'bg-line-iac'],
  ] as const)('tone=%s tô %s', (tone, expected) => {
    const { container } = render(<Meter value={1} max={2} tone={tone} label="Đo" />);
    const fill = container.querySelector('[data-slot="meter-fill"]') as HTMLElement;
    expect(fill.className.split(/\s+/)).toContain(expected);
  });
});
