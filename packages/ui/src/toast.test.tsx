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

/**
 * Bảng 4 trạng thái §4a khai `Toaster`/`useToast` → error = `variant:
 * 'destructive'`. Trước test này chỉ có đường `success` được chạy, nên cột
 * "Error" của bảng là một lời khai chưa ai kiểm — đúng dạng mà kiểm toán 13.A
 * đi tìm.
 */
describe('Toast — trạng thái error (§4a)', () => {
  function ErrorTrigger() {
    const { toast } = useToast();
    return (
      <button
        onClick={() =>
          toast({ title: 'Không kết thúc được phiên', description: 'Thử lại sau vài giây.', variant: 'destructive' })
        }
      >
        Kết thúc
      </button>
    );
  }

  it('variant="destructive" hiện nội dung và dùng class token destructive', async () => {
    render(
      <div>
        <ErrorTrigger />
        <Toaster />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kết thúc' }));

    const title = await screen.findByText('Không kết thúc được phiên');
    expect(screen.getByText('Thử lại sau vài giây.')).toBeDefined();

    // Class nằm trên `Toast.Root` — tổ tiên gần nhất của title mang data-slot
    // của Radix Toast.
    const root = title.closest('[role="status"], li, [data-state]');
    expect(root).not.toBeNull();
    const classes = (root as HTMLElement).className.split(/\s+/);
    expect(classes).toContain('bg-destructive');
    expect(classes).toContain('text-destructive-foreground');
  });
});

/**
 * Gác nửa còn lại của miễn trừ SC 1.4.11 (`theme/tokens.contract.test.ts`,
 * khối "miễn trừ CÓ CHỨNG MINH"). Nút đóng nằm TRÊN mặt toast đã tô đặc, nên
 * `--ring` xanh dương cạnh `bg-destructive` chỉ 1.09:1 sáng / 1.00:1 tối —
 * vòng focus vô hình đúng trên cái toast báo lỗi.
 *
 * Ở đây `ring-offset` là sai chứ không phải thiếu: khe offset mang màu NỀN
 * TRANG, thứ không hề kề nút này. `ring-current` lấy `text-{variant}-
 * foreground` do `VARIANT_CLASSES` đặt, và cặp đó đã được `TEXT_PAIRS` gác ở
 * ≥4.5:1.
 */
describe('Toaster — vòng focus của nút đóng không dùng --ring', () => {
  it('nút đóng dùng `ring-current`, KHÔNG dùng `ring-ring` (1.00:1 trên mặt destructive tối)', async () => {
    render(
      <div>
        <Trigger />
        <Toaster />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    const close = await screen.findByRole('button', { name: 'Đóng thông báo' });
    const classes = close.className.split(/\s+/);
    expect(classes).toContain('focus-visible:ring-current');
    expect(classes).not.toContain('focus-visible:ring-ring');
  });
});
