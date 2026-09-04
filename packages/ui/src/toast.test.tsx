import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Toaster, useToast } from './toast.tsx';

/**
 * `useToast()` đọc/ghi một store module-scope (singleton, đúng ý đồ — `Toaster`
 * chỉ mount MỘT LẦN ở app shell còn `toast()` gọi từ khắp nơi). Hệ quả cho
 * test: store KHÔNG tự reset giữa các `render()` khác nhau như state cục bộ
 * của component thường làm — phải tự dọn sau mỗi test bằng cách bấm hết nút
 * "Đóng thông báo" còn sót lại, nếu không toast của test trước sẽ rò sang
 * test sau.
 */
afterEach(() => {
  const { unmount } = render(<Toaster />);
  for (const button of screen.queryAllByRole('button', { name: 'Đóng thông báo' })) {
    fireEvent.click(button);
  }
  unmount();
  cleanup();
});

function Trigger() {
  const { toast } = useToast();
  return (
    <button
      onClick={() =>
        toast({ title: 'Đã lưu hồ sơ', description: 'Thông tin của bạn đã được cập nhật.', variant: 'success' })
      }
    >
      Lưu
    </button>
  );
}

describe('Toaster / useToast', () => {
  it('chưa gọi toast() ⇒ Toaster không hiện gì', () => {
    render(<Toaster />);
    expect(screen.queryByText('Đã lưu hồ sơ')).toBeNull();
  });

  it('gọi toast() từ một component bất kỳ hiện nội dung trong Toaster (không cần lồng cây con)', async () => {
    render(
      <div>
        <Trigger />
        <Toaster />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Đã lưu hồ sơ')).toBeDefined();
    expect(screen.getByText('Thông tin của bạn đã được cập nhật.')).toBeDefined();
  });

  it('bấm nút Đóng gỡ toast khỏi màn hình', async () => {
    render(
      <div>
        <Trigger />
        <Toaster />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await screen.findByText('Đã lưu hồ sơ');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    await act(async () => {});
    expect(screen.queryByText('Đã lưu hồ sơ')).toBeNull();
  });
});
