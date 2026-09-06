import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.tsx';
import { Button } from './button.tsx';

afterEach(() => {
  cleanup();
});

function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Mở hộp thoại</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận kết thúc phiên</DialogTitle>
          <DialogDescription>Phiên sandbox sẽ bị huỷ và không khôi phục được.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="destructive">Kết thúc</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('đóng mặc định — nội dung không có trong DOM', () => {
    render(<Example />);
    expect(screen.queryByText('Xác nhận kết thúc phiên')).toBeNull();
  });

  it('bấm trigger mở hộp thoại, hiện title + description, gắn đúng aria-labelledby VÀ aria-describedby', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));

    const dialog = screen.getByRole('dialog');
    const title = screen.getByText('Xác nhận kết thúc phiên');
    const description = screen.getByText('Phiên sandbox sẽ bị huỷ và không khôi phục được.');

    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    /*
     * `aria-describedby` từng chỉ nằm trong TÊN test chứ không có khẳng định
     * nào — mà đây đúng là thứ dễ mất nhất: Radix chỉ nối nó khi
     * `DialogDescription` nằm trong `DialogContent`; ai đó chuyển mô tả ra
     * ngoài (hoặc thay bằng một `<p>` thường cho "gọn") thì hộp thoại mất phần
     * giải thích ở trình đọc màn hình mà nhìn bằng mắt KHÔNG khác gì.
     */
    expect(description.id).not.toBe('');
    expect(dialog.getAttribute('aria-describedby')).toBe(description.id);
  });

  /**
   * Bẫy phạm vi: focus trap của Radix (`FocusScope`) chạy được trong jsdom vì
   * nó dựa trên sự kiện focus + thứ tự DOM, KHÔNG dựa trên bố cục — khác
   * `getBoundingClientRect` (luôn 0×0, xem chú thích ở tooltip.test.tsx). Nên
   * ba khẳng định dưới đây đo được thật, không phải xanh vô nghĩa.
   */
  describe('bẫy focus (focus trap)', () => {
    it('mở hộp thoại chuyển focus VÀO trong, không để lại ở trigger', async () => {
      const user = userEvent.setup();
      render(<Example />);
      const trigger = screen.getByRole('button', { name: 'Mở hộp thoại' });
      await user.click(trigger);

      const dialog = await screen.findByRole('dialog');
      expect(document.activeElement).not.toBe(trigger);
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('Tab vòng quanh chỉ trong hộp thoại, không thoát ra nền phía sau', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <button>Nút NGOÀI hộp thoại</button>
          <Example />
        </div>,
      );
      /*
       * Lấy tham chiếu nút ngoài TRƯỚC khi mở. Sau khi mở, Radix đặt
       * `aria-hidden` lên toàn bộ nội dung nền, nên `getByRole` không còn tìm
       * thấy nó — bản thân điều đó đã là một bằng chứng, nên khẳng định luôn
       * ở dưới thay vì lách bằng `{ hidden: true }`.
       */
      const outside = screen.getByRole('button', { name: 'Nút NGOÀI hộp thoại' });
      await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
      const dialog = await screen.findByRole('dialog');

      /*
       * Radix (`hideOthers`) gắn `aria-hidden` lên các CON TRỰC TIẾP của
       * `<body>` nằm ngoài portal, chứ không lên từng phần tử nền — nên phải
       * hỏi tổ tiên, không hỏi chính nút. (Khẳng định `outside.getAttribute`
       * trực tiếp trả `null` và đỏ, đúng như nó nên thế.)
       */
      expect(outside.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Nút NGOÀI hộp thoại' })).toBeNull();

      // Đi hết một vòng và dư vài nhịp: nếu bẫy hỏng, focus sẽ rơi ra ngoài
      // trong khoảng này.
      for (let step = 0; step < 6; step += 1) {
        await user.tab();
        expect(document.activeElement).not.toBe(outside);
        expect(dialog.contains(document.activeElement)).toBe(true);
      }
    });

    it('đóng bằng Escape trả focus VỀ trigger (không rơi về <body>)', async () => {
      const user = userEvent.setup();
      render(<Example />);
      const trigger = screen.getByRole('button', { name: 'Mở hộp thoại' });
      await user.click(trigger);
      await screen.findByRole('dialog');

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).toBeNull();
      // Rơi về <body> là hỏng thật sự chứ không phải tiểu tiết: người dùng bàn
      // phím mất chỗ đứng và phải Tab lại từ đầu trang.
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('bấm nút Đóng (X) đóng hộp thoại', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('bấm hành động trong footer (DialogClose asChild) cũng đóng hộp thoại', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    await user.click(screen.getByRole('button', { name: 'Kết thúc' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('phím Escape đóng hộp thoại', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
