import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ErrorState } from './error-state.tsx';

afterEach(() => {
  cleanup();
});

describe('ErrorState', () => {
  it('mang role="alert" và hiện đúng message', () => {
    render(<ErrorState message="Mất kết nối tới máy chủ." />);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Mất kết nối tới máy chủ.')).toBeDefined();
    expect(screen.getByText('Không tải được dữ liệu')).toBeDefined();
  });

  it('không truyền onRetry ⇒ không có nút Thử lại', () => {
    render(<ErrorState message="Lỗi." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('bấm Thử lại gọi onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="Lỗi." onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('retrying=true ⇒ nút Thử lại ở trạng thái loading, disabled', () => {
    render(<ErrorState message="Lỗi." onRetry={vi.fn()} retrying />);
    const button = screen.getByRole('button', { name: 'Thử lại' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('title tuỳ chỉnh thay được tiêu đề mặc định', () => {
    render(<ErrorState title="Hết hạn phiên" message="Đăng nhập lại để tiếp tục." />);
    expect(screen.getByText('Hết hạn phiên')).toBeDefined();
    expect(screen.queryByText('Không tải được dữ liệu')).toBeNull();
  });
});
