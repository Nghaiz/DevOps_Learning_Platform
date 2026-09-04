import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Button } from './button.tsx';

afterEach(() => {
  cleanup();
});

describe('Button — tương thích ngược', () => {
  it('ba variant cũ (primary/secondary/ghost) vẫn render không lỗi', () => {
    render(
      <div>
        <Button variant="primary">A</Button>
        <Button variant="secondary">B</Button>
        <Button variant="ghost">C</Button>
      </div>,
    );
    expect(screen.getByRole('button', { name: 'A' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'B' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'C' })).toBeDefined();
  });
});

describe('Button — variant mới', () => {
  it.each(['outline', 'destructive', 'link'] as const)('variant=%s render được', (variant) => {
    render(<Button variant={variant}>Nút</Button>);
    expect(screen.getByRole('button', { name: 'Nút' })).toBeDefined();
  });
});

describe('Button — loading', () => {
  it('loading=true ⇒ disabled, aria-busy, hiện Spinner, vẫn giữ text con trong DOM (giữ bề rộng)', () => {
    render(<Button loading>Lưu</Button>);
    // Tên hỗ trợ tiếp cận (accessible name) của nút PHẢI vẫn là "Lưu" — Spinner
    // đè lên mang `aria-hidden` nên KHÔNG được gộp "Đang tải" vào tên nút.
    // `aria-busy="true"` trên chính nút là tín hiệu bận dành cho trình đọc màn
    // hình, không phải nhãn của Spinner con.
    const button = screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    // `hidden: true` vì Spinner đè bị `aria-hidden` — vẫn PHẢI có mặt trong DOM
    // (giữ bề rộng nút), chỉ ẩn khỏi cây accessibility.
    expect(screen.getByRole('status', { name: 'Đang tải', hidden: true })).toBeDefined();
    expect(button.textContent).toBe('Lưu');
  });

  it('loading=false (mặc định) ⇒ không disabled, không Spinner', () => {
    render(<Button>Lưu</Button>);
    const button = screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Button — disabled', () => {
  it('disabled=true (không loading) ⇒ nút vô hiệu, click không gọi onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Gửi
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Button — asChild', () => {
  it('render root là phần tử con (thẻ a) thay vì <button>', () => {
    render(
      <Button asChild>
        <a href="/lessons">Đi tới bài học</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Đi tới bài học' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/lessons');
  });
});
