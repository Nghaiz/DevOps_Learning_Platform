import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast as sonnerToast } from 'sonner';
import { Toaster, useToast } from './toast.tsx';

/**
 * Hàng đợi toast là MODULE-SCOPE (singleton, đúng ý đồ — `Toaster` mount đúng
 * một lần ở app shell còn `toast()` gọi từ 18 chỗ rải rác). Hệ quả cho test:
 * hàng đợi KHÔNG tự reset giữa các `render()` như state cục bộ, nên phải dọn
 * tay, nếu không toast của test trước rò sang test sau và `findByText` bắt
 * nhầm node cũ.
 *
 * `sonnerToast.dismiss()` không tham số gỡ TẤT CẢ — rẻ và chắc hơn cách cũ (bấm
 * lần lượt mọi nút "Đóng thông báo"), vì nó không phụ thuộc việc nút đóng có
 * render ra hay không.
 */
afterEach(() => {
  sonnerToast.dismiss();
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

  /**
   * ⚠ Phải `waitFor`, không được khẳng định ngay sau `click`.
   *
   * Bản Radix trước đây gỡ node ĐỒNG BỘ, nên `await act(async () => {})` là đủ.
   * `sonner` chạy một pha thoát: nó đánh dấu toast là đang gỡ, giữ node lại cho
   * hết animation rồi mới tháo. Khẳng định ngay sau `click` sẽ thấy một `<p>`
   * RỖNG còn nằm đó — và thông điệp lỗi ("expected `<p class=…></p>` to be
   * null") đọc ra như "nút đóng không hoạt động" chứ không như "chưa chờ đủ".
   */
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
    await waitFor(() => {
      expect(screen.queryByText('Đã lưu hồ sơ')).toBeNull();
    });
  });
});

/**
 * Bảng 4 trạng thái §4a khai `Toaster`/`useToast` → error = `variant:
 * 'destructive'`. Không có test này thì cột "Error" của bảng là một lời khai
 * chưa ai kiểm.
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

  /**
   * Gác CLASS quyết định màu, không gác sự tồn tại phần tử: jsdom không tính
   * computed style, nên một test kiểm "có `<div>` không" là một test không bao
   * giờ đỏ được.
   *
   * Mốc là `[data-slot="toast"]`, KHÔNG phải `<li>` của sonner. Với
   * `toastOptions.unstyled` thì `<li>` chỉ mang lớp bố cục (`w-full`) do ta
   * truyền vào, còn màu nằm trên thẻ của `ToastCard`. Bám vào `<li>` là bám vào
   * chi tiết cài đặt của gói ngoài — đúng thứ vỏ bọc này sinh ra để giấu đi.
   */
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

    const card = title.closest('[data-slot="toast"]');
    expect(card, 'toast phải render qua ToastCard, không phải qua biến thể dựng sẵn của sonner').not.toBeNull();
    const classes = (card as HTMLElement).className.split(/\s+/);
    expect(classes).toContain('bg-destructive');
    expect(classes).toContain('text-destructive-foreground');
    expect((card as HTMLElement).dataset['variant']).toBe('destructive');
  });

  /**
   * WCAG 1.4.1 Use of Color — "đã lưu" và "lỗi" không được phân biệt CHỈ bằng
   * màu nền. Đây là nửa mà `--success` (lục) và `--destructive` (đỏ) cần: với
   * người mù màu đỏ-lục hai mặt đó là cùng một xám.
   */
  it.each([
    ['success', 'lucide-circle-check'],
    ['destructive', 'lucide-triangle-alert'],
  ])('variant="%s" có icon riêng, `aria-hidden`, không chỉ dựa vào màu', async (variant, iconClass) => {
    function VariantTrigger() {
      const { toast } = useToast();
      return (
        <button
          onClick={() => toast({ title: 'Thông báo', variant: variant as 'success' | 'destructive' })}
        >
          Bắn
        </button>
      );
    }
    render(
      <div>
        <VariantTrigger />
        <Toaster />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bắn' }));
    const title = await screen.findByText('Thông báo');
    const card = title.closest('[data-slot="toast"]') as HTMLElement;
    const icon = card.querySelector(`.${iconClass}`);
    expect(icon, `variant="${variant}" phải có icon ${iconClass}`).not.toBeNull();
    // `aria-hidden` vì tiêu đề đã nói đủ — icon lộ ra là thêm một node vô nghĩa
    // vào vùng `aria-live`, thứ trình đọc màn hình sẽ đọc thành tiếng.
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('variant mặc định CỐ Ý không có icon — nó không mang kết quả nào để vẽ', async () => {
    function PlainTrigger() {
      const { toast } = useToast();
      return <button onClick={() => toast({ title: 'Ghi chú' })}>Bắn</button>;
    }
    render(
      <div>
        <PlainTrigger />
        <Toaster />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bắn' }));
    const title = await screen.findByText('Ghi chú');
    const card = title.closest('[data-slot="toast"]') as HTMLElement;
    expect(card.querySelector('.lucide-circle-check')).toBeNull();
    expect(card.querySelector('.lucide-triangle-alert')).toBeNull();
  });
});

/**
 * Gác nửa còn lại của miễn trừ SC 1.4.11 (`theme/tokens.contract.test.ts`, khối
 * "miễn trừ CÓ CHỨNG MINH"; `p16-tokens.md` §1.7 bảng hai cơ chế).
 *
 * Nút đóng nằm TRÊN mặt toast đã tô đặc, nên `--ring` (= `--primary`) cạnh
 * `bg-destructive` chỉ được 1.06:1 sáng / 1.50:1 tối — vòng focus vô hình đúng
 * trên cái toast báo lỗi. `ring-offset` cũng SAI ở đây chứ không phải thiếu:
 * khe offset mang màu NỀN TRANG, thứ không hề kề nút này.
 */
describe('Toaster — vòng focus của nút đóng không dùng --ring', () => {
  it('nút đóng dùng `ring-current`, KHÔNG dùng `ring-ring` và KHÔNG có ring-offset', async () => {
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
    expect(classes.some((c) => c.includes('ring-offset'))).toBe(false);
  });

  /**
   * §5: toast là mặt nổi cỡ card ⇒ `rounded-lg`; §6: nó chồng lên nội dung
   * trang ⇒ `shadow-elevation-3`, và PHẢI có `border` vì Windows High Contrast
   * bỏ hẳn `box-shadow` — một mặt tách khỏi nền chỉ bằng bóng thì biến mất.
   */
  it('mặt toast dùng bậc bo góc + bậc nâng nền ngữ nghĩa, kèm viền', async () => {
    render(
      <div>
        <Trigger />
        <Toaster />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    const title = await screen.findByText('Đã lưu hồ sơ');
    const classes = (title.closest('[data-slot="toast"]') as HTMLElement).className.split(/\s+/);
    expect(classes).toContain('rounded-lg');
    expect(classes).toContain('shadow-elevation-3');
    expect(classes).toContain('border');
    // Không còn bậc bóng ngoài hệ ba bậc ngữ nghĩa.
    expect(classes).not.toContain('shadow-lg');
    expect(classes).not.toContain('shadow-md');
  });
});
